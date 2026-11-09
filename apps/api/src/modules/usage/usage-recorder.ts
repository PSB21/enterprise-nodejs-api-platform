import { UsageLogModel, type UsageLogFields } from './usage-log.model';

/**
 * Collects usage logs in memory and writes them in batches.
 *
 * Writing one document per request would add a database round trip to every gateway call.
 * Instead, the request only pushes to an array, and a timer writes the batch with one
 * insertMany. The trade-off: if the process crashes, the last couple of seconds of logs are
 * lost. That is acceptable for analytics, but would not be for billing.
 */
export class UsageRecorder {
  private buffer: UsageLogFields[] = [];
  private timer: NodeJS.Timeout | undefined;
  private flushing: Promise<void> = Promise.resolve();
  dropped = 0;

  constructor(
    private readonly flushEveryMs = 2000,
    private readonly batchSize = 200,
    // Caps memory if the database is down for a long time; newer entries are dropped.
    private readonly maxBuffered = 10_000
  ) {}

  record(entry: UsageLogFields) {
    if (this.buffer.length >= this.maxBuffered) {
      this.dropped += 1;
      return;
    }

    this.buffer.push(entry);
    this.startTimer();

    if (this.buffer.length >= this.batchSize) {
      void this.flush();
    }
  }

  /** Writes everything buffered so far. Calls queue up, so batches never overlap. */
  flush(): Promise<void> {
    this.flushing = this.flushing.then(async () => {
      const batch = this.buffer.splice(0, this.buffer.length);
      if (batch.length === 0) return;

      try {
        // ordered: false keeps inserting the rest if one document fails.
        await UsageLogModel.insertMany(batch, { ordered: false });
      } catch (err) {
        console.error(`Failed to write ${batch.length} usage logs:`, err);
      }
    });
    return this.flushing;
  }

  /** Stops the timer and writes what is left. Called on shutdown. */
  async stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.flush();
  }

  private startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), this.flushEveryMs);
    // Do not keep the process alive just for this timer.
    this.timer.unref();
  }
}

export const usageRecorder = new UsageRecorder();
