# PromisesDash Arkitektur (MVP)

## Mappstruktur

- `src/app`: App Router-sidor och API endpoints.
- `src/app/api`: API-first routes for auth, habits, daily entries, weight, calories.
- `src/components`: ateranvandbara UI-komponenter och dashboardmoduler.
- `src/lib`: serverlogik, Prisma-klient, auth-konfiguration, validering.
- `prisma/schema.prisma`: datamodeller och relationer for PostgreSQL.
- `docs`: design- och arkitekturbeskrivningar.

## Datamodell (oversikt)

- `User`: konto, auth och relation till all personlig data.
- `Category`: anvandarunika kategorier for loften.
- `Habit`: sjalva loftet/vanan inkl frekvens och uppfoljningsmetod.
- `HabitEntry`: dagsregistreringar (checkbox, numeriskt, anteckning).
- `WeightProfile`: startvikt + invagningsdag.
- `WeightEntry`: historik for viktutveckling.
- `CalorieProfile`: dagligt kalorimal.
- `CalorieEntry`: faktisk registrering av intag/forbrukning.
- `CalorieBalance`: daglig avvikelse + lopande saldo (kaloribank).

## MVP-flode

1. Registrera konto och logga in via credentials.
2. Skapa ett lofte via `/api/habits`.
3. Registrera dagens utfall via `/api/habits/entries`.
4. Registrera vikt via `/api/weight`.
5. Registrera kalorier via `/api/calories`.
6. Se samlad vy i `/dashboard`.
