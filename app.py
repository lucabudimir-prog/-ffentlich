import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import requests
import time
from datetime import datetime, timedelta

# ─────────────────────────────────────────────
# KONFIGURATION — HIER ANPASSEN
# ─────────────────────────────────────────────
try:
    ALPHA_VANTAGE_API_KEY = st.secrets["ALPHA_VANTAGE_API_KEY"]
except Exception:
    ALPHA_VANTAGE_API_KEY = "DEIN_API_KEY_HIER"  # Fallback für lokalen Test

# Deine Positionen: Kürzel -> Anzahl der Anteile + Einstandskurs (optional)
POSITIONS = {
    "CSPX.L":  {"anzahl": 0, "name": "iShares Core S&P 500"},
    "XDWD.L":  {"anzahl": 0, "name": "Xtrackers MSCI World"},
    "EIMI.L":  {"anzahl": 0, "name": "iShares MSCI EM"},
    "IWMO.L":  {"anzahl": 0, "name": "iShares MSCI World Momentum"},
    "EXSA.DE": {"anzahl": 0, "name": "iShares STOXX Europe 600"},
    "MP":      {"anzahl": 0, "name": "MP Materials"},
    "ENR.DE":  {"anzahl": 0, "name": "Siemens Energy"},
    "ONDS":    {"anzahl": 0, "name": "Ondas Holding"},
}

st.set_page_config(page_title="Investoren Dashboard", layout="wide")
st.title("📊 Investoren Dashboard")
st.caption(f"Live über Alpha Vantage · Auto-Refresh alle 60s · Stand: {datetime.now().strftime('%H:%M:%S')}")

# ─────────────────────────────────────────────
# KURSE ABRUFEN
# ─────────────────────────────────────────────
@st.cache_data(ttl=60)
def get_quote(symbol: str):
    url = "https://www.alphavantage.co/query"
    params = {"function": "GLOBAL_QUOTE", "symbol": symbol, "apikey": ALPHA_VANTAGE_API_KEY}
    try:
        r = requests.get(url, params=params, timeout=10)
        data = r.json().get("Global Quote", {})
        price = float(data.get("05. price", 0))
        return price
    except Exception:
        return 0.0

rows = []
for symbol, info in POSITIONS.items():
    price = get_quote(symbol)
    wert = price * info["anzahl"]
    rows.append({
        "Kürzel": symbol,
        "Name": info["name"],
        "Anzahl": info["anzahl"],
        "Kurs": round(price, 2),
        "Wert": round(wert, 2),
    })

df = pd.DataFrame(rows)
total_value = df["Wert"].sum()

# ─────────────────────────────────────────────
# TABELLE
# ─────────────────────────────────────────────
st.subheader("Portfolio-Positionen")
st.dataframe(df, use_container_width=True, hide_index=True)
st.metric("Gesamtwert", f"{total_value:,.2f} €")

col1, col2 = st.columns(2)

# ─────────────────────────────────────────────
# DONUT CHART
# ─────────────────────────────────────────────
with col1:
    st.subheader("Verteilung")
    if total_value > 0:
        fig = go.Figure(data=[go.Pie(
            labels=df["Kürzel"], values=df["Wert"], hole=0.55,
        )])
        fig.update_layout(margin=dict(t=10, b=10, l=10, r=10))
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Noch keine Anzahl/Kurse hinterlegt — trag deine Stückzahlen im Code ein.")

# ─────────────────────────────────────────────
# LINE CHART — 12 MONATE (Kursverlauf des größten Postens)
# ─────────────────────────────────────────────
with col2:
    st.subheader("Wertentwicklung (12 Monate) — größte Position")
    if len(df) > 0 and total_value > 0:
        top_symbol = df.sort_values("Wert", ascending=False).iloc[0]["Kürzel"]

        @st.cache_data(ttl=3600)
        def get_history(symbol: str):
            url = "https://www.alphavantage.co/query"
            params = {"function": "TIME_SERIES_MONTHLY", "symbol": symbol, "apikey": ALPHA_VANTAGE_API_KEY}
            r = requests.get(url, params=params, timeout=10)
            data = r.json().get("Monthly Time Series", {})
            dates = sorted(data.keys())[-12:]
            closes = [float(data[d]["4. close"]) for d in dates]
            return dates, closes

        try:
            dates, closes = get_history(top_symbol)
            fig2 = go.Figure(data=go.Scatter(x=dates, y=closes, mode="lines+markers"))
            fig2.update_layout(margin=dict(t=10, b=10, l=10, r=10))
            st.plotly_chart(fig2, use_container_width=True)
        except Exception:
            st.info("Historische Daten konnten nicht geladen werden.")

# ─────────────────────────────────────────────
# AUTO-REFRESH ALLE 60 SEKUNDEN
# ─────────────────────────────────────────────
time.sleep(60)
st.rerun()
