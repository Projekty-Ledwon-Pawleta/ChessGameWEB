# myapp/elo_service.py

def calculate_expected_score(rating_a, rating_b):
    """
    Oblicza szansę wygranej gracza A przeciwko B.
    Zwraca wartość od 0 do 1.
    """
    return 1 / (1 + 10 ** ((rating_b - rating_a) / 400))

def update_ratings(rating_winner, rating_loser, is_draw=False):
    """
    Zwraca krotkę (nowy_rating_wygranego, nowy_rating_przegranego).
    Stała K=32 to standard dla szachów online (dynamiczna gra).
    """
    K = 32
    
    expected_winner = calculate_expected_score(rating_winner, rating_loser)
    expected_loser = calculate_expected_score(rating_loser, rating_winner)
    
    actual_score_winner = 0.5 if is_draw else 1.0
    actual_score_loser = 0.5 if is_draw else 0.0
    
    new_rating_winner = rating_winner + K * (actual_score_winner - expected_winner)
    new_rating_loser = rating_loser + K * (actual_score_loser - expected_loser)
    
    return int(round(new_rating_winner)), int(round(new_rating_loser))