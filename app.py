import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import requests
import time
from datetime import datetime

# ─────────────────────────────────────────────
# KEYS (aus Streamlit Secrets, niemals im Code sichtbar)
# ─────────────────────────────────────────────
ALPHA_VANTAGE_API_KEY = st.secrets.get("ALPHA_VANTAGE_API_KEY", "DEIN_KEY_HIER")
ANTHROPIC_API_KEY = st.secrets.get("ANTHROPIC_API_KEY", "")

# ─────────────────────────────────────────────
# DEINE POSITIONEN — Stückzahl hier eintragen
# ─────────────────────────────────────────────
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

WATCHLIST = ["NVDA"]

REGELN = """
- Bei Kursrückgängen von -30% ohne fundamentale Negativ-News: nachkaufen statt emotional verkaufen
- Langfristig orientiert (buy & hold), thematische Einzelwetten begrenzt auf ca. 25% des Depots
- Monatliche Sparrate: ca. 200€
- Zieldepotwert: 20.000€
"""

st.set_page_config(page_title="Portfolio Command Center", layout="wide", page_icon="📊")
st.title("📊 Portfolio Command Center")
st.caption(f"Live über Alpha Vantage · Stand: {datetime.now().strftime('%H:%M:%S')}")

tab1, tab2, tab3, tab4 = st.tabs(["📊 Portfolio Dashboard", "👀 Watchlist", "📜 Rules", "🤖 Berater"])

@st.cache_data(ttl=60)
def get_quote(symbol: str):
    url = "https://www.alphavantage.co/query"
    params = {"function": "GLOBAL_QUOTE", "symbol": symbol, "apikey": ALPHA_VANTAGE_API_KEY}
    try:
        r = requests.get(url, params=params, timeout=10)
        data = r.json().get("Global Quote", {})
        return float(data.get("05. price", 0))
    except Exception:
        return 0.0

rows = []
for symbol, info in POSITIONS.items():
    price = get_quote(symbol)
    wert = price * info["anzahl"]
    rows.append({"Kürzel": symbol, "Name": info["name"], "Anzahl": info["anzahl"],
                 "Kurs": round(price, 2), "Wert": round(wert, 2)})
df = pd.DataFrame(rows)
total_value = df["Wert"].sum()

with tab1:
    st.subheader("Portfolio-Positionen")
    st.dataframe(df, use_container_width=True, hide_index=True)
    st.metric("Gesamtwert", f"{total_value:,.2f} €")

    col1, col2 = st.columns(2)
    with col1:
        st.subheader("Verteilung")
        if total_value > 0:
            fig = go.Figure(data=[go.Pie(labels=df["Kürzel"], values=df["Wert"], hole=0.55)])
            fig.update_layout(margin=dict(t=10, b=10, l=10, r=10))
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Noch keine Stückzahlen hinterlegt — trag sie oben im Code ein (POSITIONS).")

    with col2:
        st.subheader("Wertentwicklung (12 Monate) — größte Position")
        if total_value > 0:
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
                st.info("Historie konnte nicht geladen werden.")

with tab2:
    st.subheader("Watchlist")
    wl_rows = [{"Symbol": s, "Kurs": get_quote(s)} for s in WATCHLIST]
    st.dataframe(pd.DataFrame(wl_rows), use_container_width=True, hide_index=True)

with tab3:
    st.subheader("Meine Regeln")
    st.markdown(REGELN)

with tab4:
    st.subheader("KI-Berater")
    if not ANTHROPIC_API_KEY:
        st.warning("Kein ANTHROPIC_API_KEY in den Secrets hinterlegt. Trag ihn in den Streamlit-Cloud-Settings unter 'Secrets' ein, dann funktioniert der Chat.")
    else:
        if "messages" not in st.session_state:
            st.session_state.messages = []

        for msg in st.session_state.messages:
            with st.chat_message(msg["role"]):
                st.markdown(msg["content"])

        frage = st.chat_input("Frag was zu deinem Portfolio...")
        if frage:
            st.session_state.messages.append({"role": "user", "content": frage})
            with st.chat_message("user"):
                st.markdown(frage)

            kontext = f"Portfolio:\n{df.to_string(index=False)}\n\nGesamtwert: {total_value:.2f} €\n\nRegeln:\n{REGELN}"
            with st.chat_message("assistant"):
                try:
                    resp = requests.post(
                        "https://api.anthropic.com/v1/messages",
                        headers={
                            "x-api-key": ANTHROPIC_API_KEY,
                            "anthropic-version": "2023-06-01",
                            "content-type": "application/json",
                        },
                        json={
                            "model": "claude-sonnet-4-6",
                            "max_tokens": 1000,
                            "system": f"Du bist ein Portfolio-Berater. Hier ist der aktuelle Kontext:\n{kontext}",
                            "messages": [{"role": "user", "content": frage}],
                        },
                        timeout=30,
                    )
                    antwort = resp.json()["content"][0]["text"]
                except Exception as e:
                    antwort = f"Fehler beim Abrufen der Antwort: {e}"
                st.markdown(antwort)
                st.session_state.messages.append({"role": "assistant", "content": antwort})

time.sleep(60)
st.rerun()
