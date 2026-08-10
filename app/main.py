from datetime import date
from pydantic import ValidationError
from app.models import ClienteCreate, Cliente, PlanoEnum
from app.storage import carregar_clientes, salvar_clientes

#função que irá listar as informações dos clientes
def listar_clientes():
    return carregar_clientes

#Função que irá buscar os clientes pelo ID
def buscar_clientes(cliente_id: int) -> Cliente | None:
    #Função que coloca clientespela função que carrega a lista de clientes.json
    clientes = carregar_clientes
    #Percorre a lista "criada" pela função carregar_clientes e retorna o nome os dados do cliente
    for c in clientes:
        if c.id == cliente_id:
            return c
    return None

#Nome da função é autoexplicativo
def criar_cliente(dados: ClienteCreate) -> Cliente:
    #Mesma coisa lá em cima
    cliente = carregar_clientes()
    #Cria o ID do novo cliente, é default=0 pois não há clientes(Pode causar bugs)
    novo_id = max([c.id for c in clientes], default=0) + 1

    #Atribui os dados do cliente necessários
    novo_cliente = Cliente(
        id=novo_id,
        nome=dados.nome,
        email=dados.email,
        plano=dados.plano,
        ativo=dados.ativo,
        data_cadastro=date.today()
    )

    #Adiciona o cliente ao arquivo e salva no arquivo clientes.json 
    clientes.append(novo_cliente)
    salvar_clientes(clientes)
    return novo_cliente

#----------- INTERFACE CLI TEMPORÁRIA -----------
def menu():
    while True:
        print("\n" + "="*30)
        print("   GERENCIADOR DE CLIENTES   ")
        print("\n" + "="*30)
        print("1. Listar Clientes")
        print("2. Buscar Clientes por ID")
        print("3. Cadastrar Cliente")
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
                    print(f"[{c.id}] {c.nome} | {c.email} - Plano: {c.plano}")