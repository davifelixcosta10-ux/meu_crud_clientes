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

        elif opcao == "2":
            try:
                c_id = int(input("Digite o ID do cliente"))
                cliente = buscar_clientes(c_id)
                if cliente:
                    print(f"\nEncontrado: [{cliente.id}] {cliente.nome} ({cliente.email}) - Plano: {cliente.plano}")
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

        elif opcao == "0"
            print("\nSaindo...")
            break
        else:
            print("Opção inválido")

if __name__ == "__main__":
    menu()