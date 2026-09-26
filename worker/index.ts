import { handle, type Env } from './serve';

export default {
	fetch: (request, env) => handle(request, env),
} satisfies ExportedHandler<Env>;
