# Deployen naar netcup (Plesk)

Doel: `https://toepen.t-wezeman.nl`, API onder `https://toepen.t-wezeman.nl/api/`.
De map `upload/` bouwen we lokaal met `node scripts/make-upload.mjs`. Die map bevat precies wat op de server moet staan.

## Eerste keer

1. **Subdomein en HTTPS (Plesk):** maak het subdomein `toepen.t-wezeman.nl` aan. Zet onder *SSL/TLS-certificaten* een gratis "Let's Encrypt"-certificaat. HTTPS is verplicht, want de PWA werkt niet zonder.
2. **PHP-versie:** kies bij *PHP-instellingen* van het domein PHP **8.4**.
3. **Database:** maak in Plesk (*Databases*) een MySQL-database `toepen` met een gebruiker en wachtwoord. Noteer die gegevens.
4. **Schema:** open phpMyAdmin, selecteer de database `toepen` en voer `api/migrations/001_init.sql` uit (tabblad *SQL*, bestand kiezen, *Uitvoeren*).
5. **Bouwen:** voer lokaal `node scripts/make-upload.mjs` uit in de projectmap. Er ontstaat een map `upload/` met de PWA-bestanden (`index.html`, `sw.js`, `assets/`, enzovoort) en een submap `api/`.
6. **Uploaden:** upload de inhoud van `upload/` (dus de PWA-bestanden én de map `api/`) naar de document root van het subdomein, via Plesk *Bestanden* of FTP. Na de upload staan de bestanden op `…/api/index.php`, `…/api/src/`, enzovoort.
7. **Configuratie:** kopieer `api/config.example.php` op de server naar `api/config.php` en vul de databasegegevens uit stap 3 in. Dit bestand staat nooit in `upload/`, dus een nieuwe upload overschrijft het niet.
8. **Eerste beheerder:** open `https://toepen.t-wezeman.nl/api/install.php`, vul gebruikersnaam en wachtwoord (minimaal 8 tekens) in en klik op *Aanmaken*.
9. **Opruimen:** verwijder `api/install.php` van de server. Die pagina mag niet blijven staan.
10. **Controle:** open `https://toepen.t-wezeman.nl/api/me` in de browser. Je moet een JSON-antwoord met `"unauthorized"` zien (HTTP 401). Dat betekent dat de API draait.
11. **Productietest met inloggen:** voer uit (vervang gebruikersnaam en wachtwoord):
    `curl -s -X POST https://toepen.t-wezeman.nl/api/login -H "Content-Type: application/json" -d '{"username":"admin","password":"...","device_name":"test"}'`
    Kopieer de `token` uit het antwoord en voer uit:
    `curl -s https://toepen.t-wezeman.nl/api/me -H "Authorization: Bearer <token>"`
    Je moet HTTP 200 met de gebruiker terugkrijgen. Krijg je 401 terwijl het token geldig is, dan strip de host de `Authorization`-header. Probeer dan `-H "X-Auth-Token: <token>"`; die header wordt ook geaccepteerd.

Let op: een wachtwoord resetten (PATCH op de gebruiker) logt bestaande apparaten niet uit. Gebruik daarvoor "tokens intrekken" (`POST /admin/users/{id}/revoke-tokens`).

## PWA-bestanden

- Upload alles in `upload/` naar de document root van het subdomein. `api/config.php` zit er niet in en blijft op de server staan.
- **Volgorde:** upload eerst al het andere (`assets/`, `img/`, `workbox-<hash>.js`, het manifest) en als allerlaatste `sw.js` en `index.html`. Anders verwijzen die naar bestanden die nog niet op de server staan.
- `workbox-<hash>.js` staat in de root naast `sw.js` en is nodig: `sw.js` laadt dat bestand. Upload het dus altijd mee (de naam verandert per build).
- `sw.js` en `index.html` moeten bij elke release overschreven worden, anders krijgen gebruikers de nieuwe versie niet.
- De gehashte bestanden in `assets/` mogen zich ophopen. Verwijder oude bestanden pas na een paar dagen, want apparaten met een oudere versie hebben ze mogelijk nog nodig.
- Installeren op iPhone: open de site in Safari, tik op *Deel* en kies *Zet op beginscherm*.
- Installeren op Android (Chrome): open het menu en kies *App installeren* (of *Toevoegen aan startscherm*).
- Een nieuwe versie verschijnt als de melding "Nieuwe versie beschikbaar – vernieuwen" in de app; de gebruiker tikt erop om bij te werken. Tijdens een spel wordt de melding niet getoond.

## Updaten

1. Bouw opnieuw met `node scripts/make-upload.mjs`.
2. **Eerst de database:** voer nieuwe `api/migrations/NNN_*.sql`-bestanden in phpMyAdmin uit, op volgorde van nummer, en alleen de bestanden die je nog niet eerder hebt uitgevoerd. De nieuwe code verwacht de nieuwe tabellen, dus dit gaat vóór het uploaden.
   - Voer `api/migrations/002_password_links.sql` eenmalig uit (alleen bij de eerste update na deze versie; uitnodigingslinks en eigen wachtwoord).
3. Upload daarna de gewijzigde bestanden uit `upload/` (PWA) en `upload/api/` (API) naar de server, in de volgorde hierboven: `sw.js` en `index.html` als laatste. Sla `api/install.php` over (die heb je na de eerste installatie verwijderd en hoort er niet meer te staan). Overschrijf `api/config.php` niet; dat bestand zit niet in `upload/` en staat al op de server.

## Lokaal ontwikkelen

Vereist: Docker Desktop. Voer de commando's uit in de projectmap.

- Starten: `docker compose up -d`. De API draait op `http://localhost:8080/api/`.
- Stoppen: `docker compose down`.
- Dependencies installeren (PHPUnit): `docker compose exec -T php composer install --working-dir=api`
- Alle tests draaien: `docker compose exec -T php api/vendor/bin/phpunit -c api/phpunit.xml`
- Eén testklasse: `docker compose exec -T php api/vendor/bin/phpunit -c api/phpunit.xml --filter AuthTest`
- Deploypakket bouwen: `node scripts/make-upload.mjs`

Als `docker` niet gevonden wordt (Windows/Git Bash), voeg dan de map `resources/bin` van Docker Desktop toe aan je PATH.
