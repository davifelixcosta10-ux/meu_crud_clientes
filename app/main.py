from datetime import date
from pydantic import ValidationError
from app.models import ClienteCreate, Cliente, PlanoEnum, ClienteUpdate
from app.storage import carregar_clientes, salvar_clientes

#função que irá listar as informações dos clientes
def listar_clientes():
    return carregar_clientes()

#Função que irá buscar os clientes pelo ID
def buscar_clientes(cliente_id: int) -> Cliente | None:
    #Função que coloca clientespela função que carrega a lista de clientes.json
    clientes = carregar_clientes()
    #Percorre a lista "criada" pela função carregar_clientes e retorna o nome os dados do cliente
    for c in clientes:
        if c.id == cliente_id:
            return c
    return None

#Nome da função é autoexplicativo
def criar_cliente(dados: ClienteCreate) -> Cliente:
    #Mesma coisa lá em cima
    clientes = carregar_clientes()
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

def deletar_clientes(cliente_id: int) -> bool:
    clientes = carregar_clientes()
    #Peneira para manter apenas quem NÃO tem ID passado
    clientes_filtrados = [c for c in clientes if c.id != cliente_id]

    if len(clientes_filtrados) == len(clientes):
        return False # Nenhum cliente foi removido (ID não existe)

    salvar_clientes(clientes_filtrados)
    return True

def atualizar_cliente(cliente_id: int, dados_novos: ClienteUpdate) -> Cliente | None:
    clientes = carregar_clientes()

    for idx, c in enumerate(clientes):
        if c.id == cliente_id:
            #Pega apenas os campos que já foram preenchidos (diferentes de None)
            campos_para_atualizar = dados_novos.model_dump(exclude_unset=True)

            # Cria uma cópia do cliente  mantendo o ID e a data intactos
            cliente_atualizado = c.model_copy(update=campos_para_atualizar)

            clientes[idx] = cliente_atualizado
            salvar_clientes(clientes)
            return cliente_atualizado
        
    return None

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
                    print(f"[{c.id}] {c.nome} | {c.email} - Plano: {c.plano}")

        elif opcao == "2":
            try:
                c_id = int(input("Digite o ID do cliente: "))
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