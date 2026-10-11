import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN_LENGTH, passwordPolicyIssues } from '../password-policy';

describe('passwordPolicyIssues', () => {
  it('accepte un mot de passe suffisamment long et non trivial', () => {
    expect(passwordPolicyIssues('CorrectHorseBattery9')).toEqual([]);
  });

  it('refuse un mot de passe trop court', () => {
    expect(passwordPolicyIssues('short1')).toContain(
      `Mot de passe : ${PASSWORD_MIN_LENGTH} caractères minimum.`,
    );
  });

  it('refuse un caractère unique répété', () => {
    expect(passwordPolicyIssues('aaaaaaaaaaaa').length).toBeGreaterThan(0);
  });

  it('refuse un mot de passe courant connu', () => {
    expect(passwordPolicyIssues('motdepasse1').length).toBeGreaterThan(0);
  });

  it('refuse un mot de passe contenant la partie locale de l’e-mail du compte', () => {
    const issues = passwordPolicyIssues('juliendupont2026', { email: 'juliendupont@demo.example' });
    expect(issues.length).toBeGreaterThan(0);
  });

  it('n’impose pas de contrainte liée à l’e-mail quand la partie locale est trop courte', () => {
    expect(passwordPolicyIssues('CorrectHorseBattery9', { email: 'ab@demo.example' })).toEqual([]);
  });
});
