import json
from pathlib import Path
from app.models import Cliente
arquivo = Path("data/clientes.json")

#Função que fará a leitura do arquivo clientes.json e retornará "FileNotFoundError" caso o arquivo esteja vazio
def carregar_clientes():
    try:
        with open(arquivo, "r", encoding="utf-8") as f:
            dados = json.load(f)
            return [Cliente(**item) for item in dados]
    except (FileNotFoundError, json.JSONDecodeError):
        return []


#Função para salvar os clientes em formato de dicionário no arquivo clientes.json
def salvar_clientes(clientes: list):
    arquivo.parent.mkdir(parents=True, exist_ok=True)

    # Converte a lista de objetos Cliente para dicionários legíveis pelo JSON
    dados_para_salvar = [cliente.model_dump(mode="json") for cliente in clientes]

    with open(arquivo, "w", encoding="utf-8") as f:
        json.dump(dados_para_salvar, f, indent=4, ensure_ascii=False)