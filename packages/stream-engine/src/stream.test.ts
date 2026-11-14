import { describe, expect, it } from 'vitest';
import { buildFfmpegArgs, ProgressParser, assessHealth, redactRtmpUrl, QUALITY_PROFILES } from './index';

describe('stream-engine', () => {
  it('monta argumentos para RTMP sem shell', () => {
    const p = QUALITY_PROFILES[0]!;
    const args = buildFfmpegArgs({ kind: 'image2pipe', fps: 30 }, { target: 'rtmp://live.example/app/KEY' }, p);
    expect(args).toContain('libx264');
    expect(args.slice(-3)).toEqual(['-f', 'flv', 'rtmp://live.example/app/KEY']);
    expect(args).not.toContain('-y');
    expect(args[args.indexOf('-g') + 1]).toBe('60');
  });
  it('arquivo local usa -y', () => {
    const args = buildFfmpegArgs({ kind: 'testsrc', fps: 30 }, { target: '/tmp/out.mp4' }, QUALITY_PROFILES[3]!);
    expect(args).toContain('-y');
  });
  it('lê progresso do ffmpeg', () => {
    const parser = new ProgressParser();
    const a = parser.push('frame=120\nfps=29.9\nbitrate=2450.1kbits/s\ndrop_frames=0\nspeed=1.01x\nout_time_us=4000000\nprog');
    expect(a).toHaveLength(0);
    const b = parser.push('ress=continue\n');
    expect(b[0]).toMatchObject({ frame: 120, fps: 29.9, bitrateKbps: 2450.1, dropFrames: 0, speed: 1.01, outTimeMs: 4000, progress: 'continue' });
  });
  it('avalia saúde', () => {
    expect(assessHealth({ fps: 30, speed: 1 }, 30)).toBe('healthy');
    expect(assessHealth({ fps: 24, speed: 1 }, 30)).toBe('degraded');
    expect(assessHealth({ fps: 10 }, 30)).toBe('failing');
  });
  it('oculta chave RTMP', () => {
    expect(redactRtmpUrl('rtmp://push.example.com/live/abc123')).toBe('rtmp://push.example.com/live/••••');
  });
});
