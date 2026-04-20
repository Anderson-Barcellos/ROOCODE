import json
from fastapi import APIRouter, UploadFile
from fastapi.responses import JSONResponse
from pathlib import Path
import pandas as pd
from pandas.errors import EmptyDataError

router = APIRouter()


def _organizeMetrics(path: Path) -> bool:
    try:
        df = pd.read_csv(path)
    except EmptyDataError:
        return False
 #   df["Data/Hora"] = pd.to_datetime(df["Data/Hora"], format="%Y-%m-%d %H:%M:%S")
 #  df["Data/Hora"] = df["Data/Hora"].dt.strftime("%d-%m-%Y")

    drop_list = [header for header in df.columns if "(hr)" in header or "(kg)" in header or "Temperatura Basal do Corpo" in header or "Temperatura Corporal" in header]
    if drop_list != []:
        try:
            df.drop(columns=drop_list, inplace=True)
            df.to_csv(path, index=False, encoding="utf-8")
        except Exception as e:
            print(f"[❌]: Error dropping columns - {e}")
            return False
    return True


@router.post("")
async def process_metrics_data(HealthData: UploadFile):
    path = Path(__file__).parent / "metrics.csv"
    path.parent.mkdir(parents=True, exist_ok=True)

    binary = await HealthData.read()
    with open(path, "wb") as f:
        f.write(binary)

    if not _organizeMetrics(path):
        return JSONResponse(content={"message": "Metrics file is empty or invalid"}, status_code=422)

    print("[🏁]: binary payload saved successfully")
    return JSONResponse(content={"message": "File created"})


@router.get("")
async def getMetrics():
    path = Path(__file__).parent / "metrics.csv"
    if not path.exists():
        return JSONResponse(content=[], status_code=200)
    try:
        df = pd.read_csv(path)
    except EmptyDataError:
        return JSONResponse(content=[], status_code=200)
    # Pipeline: to_json converte NaN → null (pandas safe) → json.loads volta pra list[dict].
    # Por que não to_dict direto: preserva NaN (float) que Starlette rejeita com ValueError.
    # Por que não to_json como resposta: geraria double-encoding (string JSON envolta em aspas).
    records = json.loads(df.to_json(orient="records")) #type: ignore
    return JSONResponse(content=records)
