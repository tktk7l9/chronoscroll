import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import ThemeToggle from './ThemeToggle.svelte';

describe('ThemeToggle', () => {
	it('cycles auto → dark → light → auto, applying and remembering the choice', async () => {
		const user = userEvent.setup();
		render(ThemeToggle);
		const root = document.documentElement;

		const button = screen.getByRole('button', { name: 'テーマ切替（現在: 自動）' });
		expect(root.dataset.theme).toBeUndefined();

		await user.click(button);
		expect(button).toHaveAccessibleName('テーマ切替（現在: ダーク）');
		expect(root.dataset.theme).toBe('dark');
		expect(localStorage.getItem('theme')).toBe('dark');

		await user.click(button);
		expect(button).toHaveAccessibleName('テーマ切替（現在: ライト）');
		expect(root.dataset.theme).toBe('light');
		expect(localStorage.getItem('theme')).toBe('light');

		await user.click(button);
		expect(button).toHaveAccessibleName('テーマ切替（現在: 自動）');
		expect(root.dataset.theme).toBeUndefined();
		expect(localStorage.getItem('theme')).toBeNull();
	});

	it('restores a saved theme on load and ignores unknown values', () => {
		localStorage.setItem('theme', 'light');
		const { unmount } = render(ThemeToggle);
		expect(screen.getByRole('button', { name: 'テーマ切替（現在: ライト）' })).toBeInTheDocument();
		expect(document.documentElement.dataset.theme).toBe('light');
		unmount();

		localStorage.setItem('theme', 'sepia');
		render(ThemeToggle);
		expect(screen.getByRole('button', { name: 'テーマ切替（現在: 自動）' })).toBeInTheDocument();
	});
});
