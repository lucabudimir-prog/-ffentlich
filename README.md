# Finance Command Center

Persönliches Finanz-Dashboard mit KI-Advisor (Claude) — als einzelne statische HTML-Datei, gehostet über GitHub Pages.

**Live:** https://lucabudimir-prog.github.io/-ffentlich/

## Features
- Portfolio-Verwaltung (Positionen anlegen/bearbeiten, Cash-Bestand) — lokal im Browser gespeichert
- Live-Kurse über Alpha Vantage (via Anthropic MCP-Connector)
- Fiduciary Advisor: Chat mit Portfoliobezug, powered by Claude (claude-opus-5)
- News- & Event-Übersicht

## Setup
Unter **Settings → API-Schlüssel** eintragen (beide bleiben lokal im Browser):
1. Anthropic API-Key (console.anthropic.com) — für Advisor & Kursabruf
2. Alpha Vantage API-Key (alphavantage.co) — für echte Marktdaten

## Entwicklung
```
npm install
node build.mjs   # baut die komplette App in eine einzelne index.html
```
Quellcode in `src/`, Deployment automatisch via GitHub Actions bei Push auf `main`.

Keine Anlageberatung.
