import pandas as pd
from pathlib import Path
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pandas.errors import EmptyDataError

router = APIRouter()
path = Path(__file__).parent / "mood.csv"
path.parent.mkdir(parents=True, exist_ok=True)

def _scalingValence(value: int | float) -> float:
    """
    Scales the valence value to a range of 0 to 100.
    """
    return (value + 100) / 2


def _format_mood_date(value: object) -> str:
    """
    Preserva granularidade horária quando presente no payload do iPhone.

    Apple State of Mind envia dois tipos via AutoExport:
    - 'Humor Diário' → só data (DD/MM/AAAA)
    - 'Emoção Momentânea' → data + hora (DD/MM/AAAA HH:MM:SS)

    Antes (bug pré-Fase 8B): strftime("%d/%m/%Y") descartava a hora em todas
    as linhas, impossibilitando análise intraday PK×humor. Agora formatamos
    com hora quando o parse detectar componente temporal não-zero.
    """
    parsed = pd.to_datetime(value, format="mixed", dayfirst=True, errors="raise")  # type: ignore
    has_time = parsed.hour != 0 or parsed.minute != 0 or parsed.second != 0  # type: ignore
    return parsed.strftime("%d/%m/%Y %H:%M:%S" if has_time else "%d/%m/%Y")  # type: ignore


def _normalize_mood_association(value: object) -> float:
    numeric = float(str(value).replace(",", "."))
    if -1 <= numeric <= 1:
        return _scalingValence(numeric * 100)
    if 0 <= numeric <= 100:
        return numeric
    raise ValueError(f"Associações fora da escala esperada: {value}")


def _organizeMood() -> bool:
    """
    Organizes the mood data by converting the "Iniciar" column to a standardized format,
    dropping unnecessary columns, and saving the result to the disk.
    """
    try:
        #Loading the CSV file
        dataframe = pd.read_csv(path)
        #Converting the "Iniciar" column to a standardized format
        dataframe["Iniciar"] = dataframe["Iniciar"].apply(_format_mood_date)

        #Dropping unnecessary columns
        dataframe = dataframe.drop(
            ["Tipo", "Rótulos", "Classificação de Valência"], axis=1, errors="ignore"
        )
        #scaling the valence value to a range of 0 to 100
        dataframe["Associações"] = dataframe["Associações"].apply(
            _normalize_mood_association
        )
        #Saving the result to the disk
        dataframe.to_csv(path, index=False)
        return True
    except (EmptyDataError, KeyError, ValueError) as e:
        print(e)
        return False


@router.post("")
async def process_mood_data(request: Request):
    """
    Receives and processes an uploaded mood data CSV file.

    This endpoint accepts an upload of a CSV file containing mood records.
    The uploaded file is saved to disk and then cleaned/organized:
    - Dates are standardized.
    - Unnecessary columns are dropped.
    - Valence scores are scaled.

    Accepts file via multipart/form-data as 'HealthData', or, if not present,
    attempts to extract the file from any provided form field.
    Uses raw Request (not UploadFile) because AutoExport fails to generate
    a compatible filename for the FastAPI typed parameter.

    Returns:
        JSONResponse: {"message": "File created"} on success,
        or an error message with status 422 if no file is found.
    """
    form = await request.form()

    # Tenta campo 'HealthData' primeiro; fallback para primeiro campo com .read()
    file_obj = form.get("HealthData")
    if file_obj is None:
        for val in form.values():
            if hasattr(val, "read"):
                file_obj = val
                break

    if file_obj is None:
        return JSONResponse(
            content={"message": "No file found in request"},
            status_code=422,
        )

    binary = await file_obj.read()  # type: ignore
    with open(path, "wb") as f:
        f.write(binary)

    if not _organizeMood():
        return JSONResponse(
            content={"message": "Mood file is empty or invalid"},
            status_code=422,
        )
    else:
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
