import { describe, expect, it } from 'vitest';
import { SESSION_STATES } from '@live-arena/shared';
import { assertTransition, availableActions, canTransition, InvalidTransitionError, SESSION_TRANSITIONS } from './state-machine';
import { automationInputSchema, intervalDue, nextInRotation } from './automation-rules';

describe('máquina de estados da sessão', () => {
  it('define transições para todos os estados', () => {
    for (const s of SESSION_STATES) expect(SESSION_TRANSITIONS[s]).toBeDefined();
  });
  it('permite o fluxo feliz', () => {
    expect(canTransition('IDLE', 'STARTING')).toBe(true);
    expect(canTransition('STARTING', 'RUNNING')).toBe(true);
    expect(canTransition('RUNNING', 'PAUSED')).toBe(true);
    expect(canTransition('PAUSED', 'RUNNING')).toBe(true);
    expect(canTransition('RUNNING', 'STOPPING')).toBe(true);
    expect(canTransition('STOPPING', 'STOPPED')).toBe(true);
  });
  it('rejeita transições inválidas', () => {
    expect(() => assertTransition('STOPPED', 'PAUSED')).toThrow(InvalidTransitionError);
    expect(canTransition('IDLE', 'RUNNING')).toBe(false);
  });
  it('ações disponíveis por estado', () => {
    expect(availableActions('IDLE')).toEqual(['start']);
    expect(availableActions('RUNNING')).toEqual(['pause', 'stop']);
    expect(availableActions('PAUSED')).toEqual(['resume', 'stop']);
  });
});

describe('automações', () => {
  it('valida entrada', () => {
    const ok = automationInputSchema.safeParse({ name: 'Rotação', rules: [{ trigger: { kind: 'INTERVAL', minutes: 10 }, action: { kind: 'RESET_ROUND' } }] });
    expect(ok.success).toBe(true);
    const bad = automationInputSchema.safeParse({ name: 'x', rules: [{ trigger: { kind: 'INTERVAL', minutes: 0 }, action: { kind: 'RESET_ROUND' } }] });
    expect(bad.success).toBe(false);
  });
  it('intervalDue e rotação', () => {
    expect(intervalDue(null, 5, 0)).toBe(true);
    expect(intervalDue(0, 5, 299_000)).toBe(false);
    expect(intervalDue(0, 5, 300_000)).toBe(true);
    expect(nextInRotation(['a', 'b', 'c'], 'c')).toBe('a');
    expect(nextInRotation(['a', 'b'], 'x')).toBe('a');
  });
});
