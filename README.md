# PromisesDash

Modern, responsiv dashboard for personliga loften, vanor och mal.

## Lokal setup (snabbstart)

### 1) Krav

- Node.js 20+
- Docker Desktop

### 2) Installera paket

```bash
npm install
```

### 3) Konfigurera miljo

```bash
copy .env.example .env
```

Om `copy` inte fungerar i din terminal, skapa `.env` manuellt med samma innehall som `.env.example`.

### 4) Starta databas + migrering + seed

```bash
npm run setup:local
```

Detta gor:
- startar PostgreSQL via Docker (`docker-compose.yml`)
- kor Prisma migration
- fyller databasen med demo-data

### 5) Starta appen

```bash
npm run dev
```

Oppna [http://localhost:3000](http://localhost:3000)

## Demo-inloggning

- Användarnamn: `demo_user`
- E-post: `demo@promisesdash.local`
- Losenord: `Demo12345!`

## Nyttiga kommandon

- `npm run db:up` - starta databas
- `npm run db:down` - stoppa databas
- `npm run prisma:migrate` - skapa/uppdatera migration
- `npm run prisma:seed` - fyll pa demo-data
- `npm run prisma:studio` - oppna Prisma Studio
- `npm run lint` - lint
- `npm run build` - produktionstest
