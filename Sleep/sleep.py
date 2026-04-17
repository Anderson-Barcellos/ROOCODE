from fastapi import APIRouter, UploadFile
from fastapi.responses import JSONResponse
import pandas as pd
from pathlib import Path


router = APIRouter()
sleep_data_path = Path(__file__).parent / "sleep_data.csv"
sleep_data_path.parent.mkdir(parents=True, exist_ok=True)

def _organizeSleep():
    data = pd.read_csv(sleep_data_path)

    if "Date/Time" in data.columns:
        dates = pd.to_datetime(pd.Series(data["Date/Time"]), format="mixed")
        data["Date/Time"] = pd.Series([date.strftime("%d-%m-%y") for date in dates])

    cols_to_drop = [c for c in ["Start", "End", "Sources"] if c in data.columns]
    if cols_to_drop:
        data = data.drop(cols_to_drop, axis=1)

    data.to_csv(sleep_data_path, index=False)



@router.post("")
async def processSleep(HealthData: UploadFile):
    binary = await HealthData.read(-1)

    with open(sleep_data_path, "wb") as f:
        f.write(binary)

    _organizeSleep()
    return JSONResponse(content={"message": "File created"})

@router.get("")
async def getSleep():
    if not sleep_data_path.exists():
        return JSONResponse(content=[], status_code=200)
    df = pd.read_csv(sleep_data_path)
    return JSONResponse(content=df.to_dict(orient="records"))
