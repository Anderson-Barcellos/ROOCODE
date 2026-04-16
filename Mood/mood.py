import pandas as pd
from datetime import datetime as dt
from pathlib import Path
from fastapi import APIRouter, UploadFile
from fastapi.responses import JSONResponse

router = APIRouter()


def _scalingValence(value: int | float) -> float:
    return (value + 100) / 2


def _organizeMood(path: Path):
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
async def process_mood_data(HealthData: UploadFile):
    path = Path(__file__).parent / "mood.csv"
    path.parent.mkdir(parents=True, exist_ok=True)

    binary = await HealthData.read(-1)
    with open(path, "wb") as f:
        f.write(binary)

    _organizeMood(path)
    return JSONResponse(content={"message": "File created"})


@router.get("")
async def getMood():
    path = Path(__file__).parent / "mood.csv"
    if not path.exists():
        return JSONResponse(content=[], status_code=200)
    df = pd.read_csv(path)
    return JSONResponse(content=df.to_dict(orient="records"))
