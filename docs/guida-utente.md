# Guida Utente - Monthly Report App

Versione: 0.1.0-beta.4
Ultimo aggiornamento: 10/03/2026

## Scopo
Questa guida spiega come usare l'app dall'apertura fino all'export Excel. E una guida completa, passo-passo.

## Prima volta che apri l'app
1. Apri l'app e resta sulla Home.
2. Usa i pulsanti principali per entrare in Report Mensile o nello Storico Esportazioni.
3. Se e la prima volta, inizia dal Report Mensile.

## Flusso completo (passo-passo)
### 1) Apri il Report Mensile
- Vai su: Home -> Report Mensile.
- Qui lavori sul mese corrente o su un altro mese.

### 2) Seleziona il mese
- Nel box "Selezione Mese", scegli il mese di riferimento.
- Inserisci il nome e cognome del dipendente.

### 3) Carica il template del mese
- Premi "Carica Template Mese".
- L'app prepara la base del report per il mese selezionato.

### 4) Gestisci festivita (se servono)
- Se ci sono festivita nel mese, aggiungile.
- Usa "Gestisci Festivita" e seleziona data e motivo.
- Puoi anche rimuovere una festivita gia inserita.

### 5) Inserisci i giorni e le attivita
- Se non ci sono righe, usa "Aggiungi Giorno".
- Ogni giorno puo avere una o piu attivita.
- Per ogni attivita compila:
  - Codice attivita
  - Descrizione attivita
  - Estratto (se richiesto)
  - Cliente (se richiesto)
  - Ore
  - Note (opzionale)

Regole importanti:
- Ogni giorno lavorativo deve avere almeno 8 ore.
- Se superi 8 ore in un giorno, usa il codice ST (straordinario).
- Le ore vanno inserite con step di 0.5.

### 6) Controlla il riepilogo
- Scorri la sezione "Riepilogo".
- Verifica: ore totali, giorni lavorativi, giorni dichiarati, quadrature, straordinari.
- Se ci sono avvisi, correggi prima di esportare.

### 7) Esporta in Excel
- Vai alla sezione "Esporta Report".
- Se il tasto e disabilitato, leggi il motivo e correggi i dati.
- Clicca "Esporta" per generare il file Excel.

Dove finisce il file:
- Versione desktop (Electron): Documenti\Monthly Report Exports
- Versione browser: cartella Download

### 8) Backup e ripristino
- In "Selezione Mese" trovi:
  - "Esporta backup JSON" per salvare una copia del mese.
  - "Ripristina backup JSON" per caricare un backup.
- Usa il backup prima di modifiche importanti.

### 9) Gestione estratti
- Vai a "Elenco Estratti".
- Crea o aggiorna gli estratti usati nelle attivita.
- Verifica che ogni estratto abbia codice, descrizione e cliente.

### 10) Storico esportazioni
- Vai a "Storico Esportazioni".
- Vedi tutti i file creati.
- Puoi scaricare o eliminare una voce.
- Lo storico e locale (non e condiviso online).

## Controlli finali prima di consegnare
- Nessun giorno lavorativo con meno di 8 ore.
- Straordinari presenti se superi 8 ore in un giorno.
- Estratti associati correttamente.
- Riepilogo senza avvisi.
- File Excel aperto e verificato.

## Problemi comuni e soluzioni rapide
- "Export disabilitato": controlla che tutti i giorni siano validi e che il mese sia completo.
- "Excel non si apre": rigenera l'export e non rinominare l'estensione.
- "Mese incompleto": verifica ore e festivita.

## Suggerimenti pratici
- Compila ogni giorno appena possibile, non a fine mese.
- Usa le note solo per informazioni davvero utili.
- Fai un backup prima di modifiche massive.

## Supporto
- Per supporto interno, contatta l'amministrazione o il referente aziendale.
