# Deployen naar netcup (Plesk)

Doel: `https://toepen.t-wezeman.nl`, API onder `https://toepen.t-wezeman.nl/api/`.
De map `upload/` bouwen we lokaal met `node scripts/make-upload.mjs`. Die map bevat precies wat op de server moet staan.

## Eerste keer

1. **Subdomein en HTTPS (Plesk):** maak het subdomein `toepen.t-wezeman.nl` aan. Zet onder *SSL/TLS-certificaten* een gratis "Let's Encrypt"-certificaat. HTTPS is verplicht, want de PWA werkt niet zonder.
2. **PHP-versie:** kies bij *PHP-instellingen* van het domein PHP **8.4**.
3. **Database:** maak in Plesk (*Databases*) een MySQL-database `toepen` met een gebruiker en wachtwoord. Noteer die gegevens.
4. **Schema:** open phpMyAdmin, selecteer de database `toepen` en voer `api/migrations/001_init.sql` uit (tabblad *SQL*, bestand kiezen, *Uitvoeren*).
5. **Bouwen:** voer lokaal `node scripts/make-upload.mjs` uit in de projectmap. Er ontstaat een map `upload/` met een submap `api/`.
6. **Uploaden:** upload de inhoud van `upload/` (dus de map `api/`) naar de document root van het subdomein, via Plesk *Bestanden* of FTP. Na de upload staan de bestanden op `…/api/index.php`, `…/api/src/`, enzovoort.
7. **Configuratie:** kopieer `api/config.example.php` op de server naar `api/config.php` en vul de databasegegevens uit stap 3 in. Dit bestand staat nooit in `upload/`, dus een nieuwe upload overschrijft het niet.
8. **Eerste beheerder:** open `https://toepen.t-wezeman.nl/api/install.php`, vul gebruikersnaam en wachtwoord (minimaal 8 tekens) in en klik op *Aanmaken*.
9. **Opruimen:** verwijder `api/install.php` van de server. Die pagina mag niet blijven staan.
10. **Controle:** open `https://toepen.t-wezeman.nl/api/me` in de browser. Je moet een JSON-antwoord met `"unauthorized"` zien (HTTP 401). Dat betekent dat de API draait.

## Updaten

1. Bouw opnieuw met `node scripts/make-upload.mjs`.
2. Upload de gewijzigde bestanden uit `upload/api/` naar de server. Overschrijf `config.php` niet; die staat er al.
3. Voer nieuwe `api/migrations/NNN_*.sql`-bestanden in phpMyAdmin uit, op volgorde van nummer, en alleen de bestanden die je nog niet eerder hebt uitgevoerd.

## Lokaal ontwikkelen

Vereist: Docker Desktop. Voer de commando's uit in de projectmap.

- Starten: `docker compose up -d`. De API draait op `http://localhost:8080/api/`.
- Stoppen: `docker compose down`.
- Dependencies installeren (PHPUnit): `docker compose exec -T php composer install --working-dir=api`
- Alle tests draaien: `docker compose exec -T php api/vendor/bin/phpunit -c api/phpunit.xml`
- Eén testklasse: `docker compose exec -T php api/vendor/bin/phpunit -c api/phpunit.xml --filter AuthTest`
- Deploypakket bouwen: `node scripts/make-upload.mjs`

Als `docker` niet gevonden wordt (Windows/Git Bash), voeg dan de map `resources/bin` van Docker Desktop toe aan je PATH.
