import os
from datetime import date
from pydantic import ValidationError
from app.models import ClienteCreate, Cliente, PlanoEnum, ClienteUpdate
from app.storage import (
    carregar_clientes,
    salvar_novo_cliente,
    atualizar_cliente_db,
    deletar_cliente_db,
)
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Permite que o frontend acesse os endpoints sem ser bloqueado
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Em produção, você pode restringir para "https://site-one-peach-32.vercel.app"
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servir arquivos estáticos do frontend
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static_files")

# --- ENDPOINTS DA API FASTAPI ---

@app.get("/clientes", response_model=list[Cliente])
def api_listar_clientes():
    return listar_clientes()

@app.get("/clientes/{cliente_id}", response_model=Cliente)
def api_buscar_cliente(cliente_id: int):
    cliente = buscar_clientes(cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return cliente

@app.post("/clientes", response_model=Cliente, status_code=status.HTTP_201_CREATED)
def api_criar_cliente(dados: ClienteCreate):
    return criar_cliente(dados)

@app.patch("/clientes/{cliente_id}", response_model=Cliente)
def api_atualizar_cliente(cliente_id: int, dados: ClienteUpdate):
    cliente = atualizar_cliente(cliente_id, dados)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return cliente

@app.delete("/clientes/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_deletar_cliente(cliente_id: int):
    sucesso = deletar_clientes(cliente_id)
    if not sucesso:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

# Mount da página principal (HTML) na raiz
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

# --- FUNÇÕES DE NEGÓCIO ---

# função que irá listar as informações dos clientes
def listar_clientes() -> list[Cliente]:
    return carregar_clientes()

# Função que irá buscar os clientes pelo ID
def buscar_clientes(cliente_id: int) -> Cliente | None:
    clientes = carregar_clientes()
    for c in clientes:
        if c.id == cliente_id:
            return c
    return None

# Função para criar um novo cliente no banco de dados (Supabase)
def criar_cliente(dados: ClienteCreate) -> Cliente:
    payload = dados.model_dump(mode="json")
    payload["data_cadastro"] = date.today().isoformat()
    return salvar_novo_cliente(payload)

# Função para deletar um cliente pelo ID
def deletar_clientes(cliente_id: int) -> bool:
    return deletar_cliente_db(cliente_id)

# Função para atualizar os dados de um cliente
def atualizar_cliente(cliente_id: int, dados_novos: ClienteUpdate) -> Cliente | None:
    campos_para_atualizar = dados_novos.model_dump(exclude_unset=True, mode="json")
    if not campos_para_atualizar:
        return buscar_clientes(cliente_id)
    return atualizar_cliente_db(cliente_id, campos_para_atualizar)

#----------- INTERFACE CLI TEMPORÁRIA -----------
def menu():
    while True:
        print("\n" + "="*30)
        print("   GERENCIADOR DE CLIENTES   ")
        print("\n" + "="*30)
        print("1. Listar Clientes")
        print("2. Buscar Clientes por ID")
        print("3. Cadastrar Cliente")
        print("4. Atualizar cliente")
        print("5. Deletar cliente")
        print("0. Sair")

        opcao = input("\nEscolha a opção desejada: ").strip()

        if opcao == "1":
            clientes = listar_clientes()
            if not clientes:
                print("\nNão há clientes cadastrados")
            else:
                print("\n---- Lista de Clientes ----")
                for c in clientes:
                    status = "Ativo" if c.ativo else "Inativo"
                    print(f"[{c.id}] {c.nome} | {c.email} - Plano: {c.plano.value}")

        elif opcao == "2":
            try:
                c_id = int(input("Digite o ID do cliente: "))
                cliente = buscar_clientes(c_id)
                if cliente:
                    print(f"\nEncontrado: [{cliente.id}] {cliente.nome} ({cliente.email}) - Plano: {cliente.plano.value}")
                else:
                    print("\n Cliente não encontrado")
            except ValueError:
                print("\n ID inválido. Digite um número inteiro")

        elif opcao == "3":
            print("\n--- Novo Cadastro ---")
            nome = input("Nome: ").strip()
            email = input("Email: ").strip()
            print("Planos disponíveis: bronze, prata, ouro")
            plano_input = input("Plano: ").strip().lower()

            try:
                novo_dados = ClienteCreate(
                    nome=nome,
                    email=email,
                    plano=PlanoEnum(plano_input)
                )
                cliente_criado = criar_cliente(novo_dados)
                print(f"\n Cliente '{cliente_criado.nome}' cadastrado com sucesso (ID: {cliente_criado.id})!")
            except ValidationError as e:
                print("\nErro de validação nos dados:")
                for erro in e.errors():
                    print(f" - Campo '{erro['loc'][0]}': {erro['msg']}")
            except ValueError:
                print("\n Plano inválido! Escolha uma plano entre: bronze, prata e ouro")

        elif opcao == "4":
            try:
                c_id = int(input("Digite o ID do cliente que deseja atualizar: "))
                cliente = buscar_clientes(c_id)

                if not cliente:
                    print("\n❌ Cliente não encontrado.")
                else:
                    print(f"\nAtualizando cliente: {cliente.nome}")
                    print("(Deixe em branco e pressione ENTER para manter o valor atual)")

                    # Dicionário dinâmico contendo apenas o que for digitado
                    dados_dict = {}

                    if novo_nome := input(f"Novo nome [{cliente.nome}]: ").strip():
                        dados_dict["nome"] = novo_nome

                    if novo_email := input(f"Novo email [{cliente.email}]: ").strip():
                        dados_dict["email"] = novo_email

                    print("Planos disponíveis: bronze, prata, ouro")
                    if novo_plano_str := input(f"Novo plano [{cliente.plano.value}]: ").strip().lower():
                        dados_dict["plano"] = PlanoEnum(novo_plano_str)

                    # Se nada foi alterado, nem chama a atualização
                    if not dados_dict:
                        print("\nNenhuma alteração informada.")
                    else:
                        dados_atualizacao = ClienteUpdate(**dados_dict)
                        cliente_atualizado = atualizar_cliente(c_id, dados_atualizacao)
                        print(f"\n✅ Cliente ID {c_id} atualizado com sucesso!")

            except ValidationError as e:
                print("\n❌ Erro de validação dos novos dados.")
            except ValueError:
                print("\n❌ ID ou Plano inválido.")
        
        elif opcao == "5":
            try:
                c_id = int(input("Digite o ID do cliente a ser deletado: "))
                confirmacao = input(f"Tem certeza que deseja apagar o cliente ID {c_id}? (s/n): ").strip().lower()

                if confirmacao in ["s", "sim", "y", "yes"]:
                    if deletar_clientes(c_id):
                        print(f"\n Cliente ID {c_id} removido com sucesso!")
                    else:
                        print("\n Cliente não encontrado.")
                else:
                    print("\nOperação cancelada pelo usúario")
            except ValueError:
                print("\n Digite um número de ID válido")

        
        elif opcao == "0":
            print("\nSaindo...")
            break
        else:
            print("Opção inválido")

if __name__ == "__main__":
    menu()