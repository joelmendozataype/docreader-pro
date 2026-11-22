export type NeuralRequest =
  | { type: 'status'; id: number; voiceId: string }
  | { type: 'warmup'; id: number; voiceId: string }
  | { type: 'download'; id: number; voiceId: string }
  | { type: 'speak'; id: number; voiceId: string; text: string }
  | { type: 'remove'; id: number; voiceId: string };

export type NeuralResponse =
  | { type: 'status'; id: number; downloaded: boolean }
  | { type: 'progress'; id: number; loaded: number; total: number }
  | { type: 'audio'; id: number; audio: Blob }
  | { type: 'done'; id: number }
  | { type: 'error'; id: number; message: string };
