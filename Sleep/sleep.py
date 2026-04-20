
"""
Sleep Data Processing Module

This module provides functionality for receiving, organizing, and storing sleep data
uploaded in CSV format. It exposes FastAPI endpoints for file upload and subsequent
processing of health-related data, including standardizing date formats and removing
unnecessary columns for efficient storage and analysis.

Includes:
- FastAPI router for handling incoming sleep data uploads.
- Utilities for reading, formatting, and writing cleaned CSV files to disk.

Intended for integration into a broader health-tracking ecosystem.
"""


from fastapi import APIRouter, UploadFile
from fastapi.responses import JSONResponse
import pandas as pd
from pathlib import Path
import json
from pandas.errors import EmptyDataError
# ─── Router ────────────────────────────────────────────────────────────────────
router = APIRouter()
sleep_data_path = Path(__file__).parent / "sleep_data.csv"
sleep_data_path.parent.mkdir(parents=True, exist_ok=True)

# ─── Formatting CSV Data ────────────────────────────────────────────────────────────
def _organizeSleep() -> bool:
    """
    Organizes the sleep data by converting the "Date/Time" column to a standardized format,
    dropping unnecessary columns, and saving the result to the disk.
    """
    #Loading DSV file
    try:
        data = pd.read_csv(sleep_data_path)
    except EmptyDataError:
        return False

    #Converting Date/Time column to standardized format
    if "Date/Time" in data.columns:
        dates = pd.to_datetime(pd.Series(data["Date/Time"]), format="mixed")
        data["Date/Time"] = pd.Series([date.strftime("%d-%m-%y") for date in dates])

    #Dropping unnecessary columns
    case_1 = ["Iniciar", "Fim", "Fontes"]
    case_2 = ["Start", "End", "Sources"]
    cols_to_drop = [c for c in case_1 if c in data.columns] or [c for c in case_2 if c in data.columns]
    data = data.drop(cols_to_drop, axis=1)

    #Saving the result to the disk (__file__.parent / "sleep_data.csv")
    data.to_csv(sleep_data_path, index=False, encoding="utf-8")
    return not data.empty


# ─── Process Sleep Data  ────────────────────────────────────────────────────────────
@router.post("")
async def processSleep(HealthData: UploadFile) -> JSONResponse:
    """
    ### 💤 processSleep — Receives and stores sleep data from an uploaded CSV file.
    Saves the binary content to disk and triggers data organization/cleanup.

    Args:
        HealthData (UploadFile): CSV file containing sleep records exported from health tracking app.

    Returns:
        JSONResponse: Confirmation message with structure {"File processed and saved successfully"}.

    Raises:
        HTTPException: If file upload fails or file cannot be written to disk.

    Example:
        >>> # POST /sleep with multipart/form-data containing sleep CSV
        >>> {"File processed and saved successfully"}
    """
    #Reading the binary content of the uploaded file
    binary = await HealthData.read(-1)
    #Writing the binary content to the disk __file__.parent / "sleep_data.csv")
    with open(sleep_data_path, "wb") as f:
        f.write(binary)
    #Organizing the sleep data

    if _organizeSleep():
        return JSONResponse(content={"File processed and saved successfully"}, status_code=200)
    return JSONResponse(content={"File not organized correctly"}, status_code=500)

@router.get("")
async def getSleep() -> JSONResponse:
    #Checking if the sleep data file exists
    if not sleep_data_path.exists():
        return JSONResponse(content=[], status_code=200)
    try:
        df = pd.read_csv(sleep_data_path)
    except EmptyDataError:
        return JSONResponse(content=[], status_code=200)
    #Returning the sleep data as a JSON response
    return JSONResponse(content=json.loads(df.to_json(orient="records")), status_code=200)
