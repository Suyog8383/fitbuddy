import app from './app.ts';

// Read the port from .env (strings only, so convert). Zod validation comes in Part B.
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
