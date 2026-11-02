import { connect, dbPath, migrate } from '../core/db'

// Applies pending migrations to DODO_DB: `node dist/migrate.js`. Deploys run this before restart.
const { from, to } = migrate(connect())
console.log(`${dbPath()}: migration ${from} -> ${to}`)
