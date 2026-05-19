from pathlib import Path
from pandas import read_csv
from pandas import DataFrame
import datetime

tipos_de_dados = ["Emoção Momentânea", "Humor Diário"]


def moodProcessing(csv_file: str|Path) -> DataFrame:
    df = read_csv(csv_file, sep=',')
    df = df.drop(["Classificação de Valência"], axis=1)

    date_time = [datetime.datetime.strptime(x[:-6], "%Y-%m-%d %H:%M:%S").strftime("%d-%m-%Y %H:%M:%S") for x in df["Iniciar"]]


    dados = df["Fim"]
    emocoes = df["Tipo"]
    causas = df["Rótulos"]
    humor = df["Associações"]
    valencias = df["Valência"]

    new_df = DataFrame({
        "Data": date_time,
        "Valência": valencias,
        "Humor": humor,
        "Emoçoes": emocoes,
        "Causas": causas,
    })


    return new_df

df = moodProcessing("Previous_Mood.csv")
print(df)
