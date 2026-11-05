# Blackjack

Et simpelt blackjack-spil, der kører direkte i browseren – ren HTML, CSS og JavaScript uden afhængigheder.

## Regler

- 6 kortspil i skoen, blandes igen når under 25 % er tilbage
- Blackjack betaler 3:2
- Dealer står på alle 17
- Doble på de to første kort (også efter split)
- Split af par op til 4 hænder; delte esser får ét kort hver
- Saldoen gemmes i browseren (localStorage)

Tastatur: **H** = træk, **S** = stå, **D** = doble, **P** = split.

## Kør lokalt

Åbn `index.html` i en browser, eller start den medfølgende lille server (Windows PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```

og gå til http://localhost:8080.
