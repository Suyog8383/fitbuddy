import app from './app.ts';
import { env } from './env.ts';

app.listen(env.PORT, () => {
  console.log(
    `${env.APP_NAME} running on http://localhost:${env.PORT} (${env.NODE_ENV})`,
  );
});
