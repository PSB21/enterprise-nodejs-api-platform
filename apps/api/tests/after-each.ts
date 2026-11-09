// Runs after every test in every file, so one test's background work cannot leak into the next
// or outlive its file's database connections:
// - in inline mode, events are handled after the response is sent;
// - gateway usage logs are buffered and written in batches.
import { drainEvents } from '../src/events/bus';
import { usageRecorder } from '../src/modules/usage/usage-recorder';

afterEach(async () => {
  await drainEvents();
  await usageRecorder.flush();
});
