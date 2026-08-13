import os
import sys

# Adiciona a raiz do projeto ao sys.path para encontrar o pacote 'app'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
