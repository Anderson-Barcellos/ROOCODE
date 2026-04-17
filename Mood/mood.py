import pandas as pd
from datetime import datetime as dt
from pathlib import Path
from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import JSONResponse
from pandas.errors import EmptyDataError

router = APIRouter()
path = Path(__file__).parent / "mood.csv"
path.parent.mkdir(parents=True, exist_ok=True)

def _scalingValence(value: int | float) -> float:
    return (value + 100) / 2


def _organizeMood():
    dataframe = pd.read_csv(path)
    try:
        dataframe["Iniciar"] = dataframe["Iniciar"].apply(
            lambda x: dt.strptime(x, "%Y-%m-%d %H:%M:%S -0300")
        )
        dataframe["Iniciar"] = dataframe["Iniciar"].apply(
            lambda x: dt.strftime(x, "%d/%m/%Y")
        )
        dataframe = dataframe.drop(
            ["Tipo", "Rótulos", "Classificação de Valência"], axis=1
        )
        dataframe["Associações"] = dataframe["Associações"].apply(
            lambda value: _scalingValence(int(value * 100))
        )
        dataframe.to_csv(path, index=False)
    except Exception as e:
        print(e)


@router.post("")
async def process_mood_data(
    request: Request,
    HealthData: UploadFile | None = File(default=None),
):
    upload = HealthData

    if upload is None:
        form = await request.form()
        upload = next(
            (
                value
                for value in form.values()
                if hasattr(value, "filename") and hasattr(value, "read")
            ),
            None,
        )

    if upload is None:
        return JSONResponse(
            content={"message": "No upload file found in request"},
            status_code=422,
        )

    binary = await upload.read()

    with open(path, "wb") as f:
        f.write(binary)

    _organizeMood()
    return JSONResponse(content={"message": "File created"})


@router.get("")
async def getMood():
    if not path.exists():
        return JSONResponse(content=[], status_code=200)
    try:
        df = pd.read_csv(path)
    except EmptyDataError:
        return JSONResponse(content=[], status_code=200)
    return JSONResponse(content=df.to_dict(orient="records"))
