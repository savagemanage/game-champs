import type { MatchAuthority } from './authority';
import type { MatchCommand, MatchEvent } from './protocol';
import type {
  MatchSessionDescriptor,
  SessionResumeRequest,
  SessionResumeResult,
} from './session';

export type TransportState = 'idle' | 'connected' | 'closed';
export type MatchEventListener = (events: readonly MatchEvent[]) => void;

export interface MatchTransport {
  readonly kind: 'local';
  readonly state: TransportState;
  connect(): Promise<MatchSessionDescriptor>;
  send(command: MatchCommand): Promise<readonly MatchEvent[]>;
  resume(request: SessionResumeRequest): Promise<SessionResumeResult>;
  subscribe(listener: MatchEventListener): () => void;
  close(): void;
}

/** In-process transport. It performs no network I/O and makes no remote-delivery claim. */
export class LocalTransport implements MatchTransport {
  readonly kind = 'local' as const;
  private transportState: TransportState = 'idle';
  private readonly listeners = new Set<MatchEventListener>();

  constructor(private readonly authority: MatchAuthority) {}

  get state(): TransportState {
    return this.transportState;
  }

  async connect(): Promise<MatchSessionDescriptor> {
    if (this.transportState === 'closed') throw new Error('Transport is closed');
    this.transportState = 'connected';
    return this.authority.session;
  }

  async send(command: MatchCommand): Promise<readonly MatchEvent[]> {
    if (this.transportState !== 'connected') throw new Error('Transport is not connected');
    const events = await this.authority.submit(command);
    if (events.length > 0) {
      for (const listener of this.listeners) listener(events);
    }
    return events;
  }

  async resume(request: SessionResumeRequest): Promise<SessionResumeResult> {
    if (this.transportState === 'closed') throw new Error('Transport is closed');
    const result = await this.authority.resume(request);
    if (result.status === 'resumed') {
      this.transportState = 'connected';
      const events = result.events.map((entry) => entry.event);
      if (events.length > 0) {
        for (const listener of this.listeners) listener(events);
      }
    }
    return result;
  }

  subscribe(listener: MatchEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.transportState = 'closed';
    this.listeners.clear();
  }
}
