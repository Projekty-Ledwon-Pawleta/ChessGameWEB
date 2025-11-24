# run_daphne.py
import os
import sys
import django

if __name__ == '__main__':
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ChessOnlineAPI.settings")

    # pełne argumenty jak z linii poleceń
    sys.argv = [
        'daphne',
        '-b', '0.0.0.0',
        '-p', '8000',
        'ChessOnlineAPI.asgi:application'
    ]

    # opcjonalnie: django.setup() przed daphne
    django.setup()
    from daphne.cli import CommandLineInterface
    CommandLineInterface.entrypoint()
