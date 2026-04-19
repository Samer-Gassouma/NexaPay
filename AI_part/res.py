import pandas as pd
"""s = pd.read_csv("artifacts/loan_scoring_results.csv")
print("rows, cols:", s.shape)
print("\nDecision counts:")
print(s["decision"].value_counts())
print("\nFraud risk counts:")
print(s["fraud_risk_level"].value_counts())
print("\nSample:")
print(s.head(5).to_string(index=False))"""

h = pd.read_csv("artifacts/credit_holdout_predictions.csv")
print(h.shape)
print(h.head(5).to_string(index=False))