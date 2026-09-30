import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { media } from '../../test/env.ts';
import { makeCollection, makeEvent } from '../../test/fixtures.ts';
import type { NewsEvent } from '../types.ts';
import DetailDialog from './DetailDialog.svelte';

function setup(ev: NewsEvent | null, extra: Record<string, unknown> = {}) {
	const onclose = vi.fn();
	const onselectrelated = vi.fn();
	const utils = render(DetailDialog, { ev, onclose, onselectrelated, ...extra });
	const dialog = utils.container.querySelector('dialog')!;
	return { ...utils, dialog, onclose, onselectrelated, user: userEvent.setup() };
}

describe('DetailDialog', () => {
	it('stays closed without an event', () => {
		const { dialog } = setup(null);
		expect(dialog.open).toBe(false);
		expect(document.documentElement).not.toHaveClass('modal-open');
	});

	it('opens as a modal showing the date, era name, labels, summary and sources', () => {
		const ev = makeEvent({
			id: '1964-10-10-olympics',
			date: '1964-10-10',
			title: '東京オリンピック開幕',
			summary: 'アジア初のオリンピック。',
			category: 'sports',
			region: 'both',
		});
		const { dialog } = setup(ev);
		expect(dialog.open).toBe(true);
		// Background scroll is locked while open
		expect(document.documentElement).toHaveClass('modal-open');
		const title = screen.getByRole('heading', { level: 2, name: '東京オリンピック開幕' });
		// The dialog is named by its title, and focus starts there so it is announced first
		expect(dialog).toHaveAttribute('aria-labelledby', title.id);
		expect(title).toHaveFocus();
		expect(screen.getByText('1964年10月10日')).toBeInTheDocument();
		expect(screen.getByText(/昭和39年/)).toBeInTheDocument();
		expect(screen.getByText('スポーツ')).toBeInTheDocument();
		expect(screen.getByText('日本・世界')).toBeInTheDocument();
		expect(screen.getByText('アジア初のオリンピック。')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Wikipedia「1900年」 ↗' })).toHaveAttribute('target', '_blank');
		const permalink = screen.getByRole('link', { name: 'このできごとの個別ページ' });
		expect(permalink).toHaveAttribute('href', '/e/1964-10-10-olympics');
		expect(permalink).toHaveAttribute('data-sveltekit-reload');
	});

	it('shows the Wikimedia image with credit, or the curated illustration', async () => {
		const withImage = makeEvent({
			image: { src: 'https://upload.wikimedia.org/a.jpg', width: 400, height: 300, credit: 'https://commons.wikimedia.org/wiki/File:a.jpg' },
		});
		const { container, rerender } = setup(withImage);
		expect(container.querySelector('img')).toHaveAttribute('src', 'https://upload.wikimedia.org/a.jpg');
		expect(screen.getByRole('link', { name: '画像: Wikimedia Commons' })).toHaveAttribute(
			'href',
			'https://commons.wikimedia.org/wiki/File:a.jpg',
		);
		await rerender({ ev: makeEvent({ id: 'b', svg: 'ship' }) });
		expect(container.querySelector('img')).toBeNull();
		expect(container.querySelector('use')).toHaveAttribute('href', '/art/sprite.svg#ship');
	});

	it('links to its collections and opens related events in place', async () => {
		const ev = makeEvent({
			related: [{ id: 'rel-1', date: '1905-09-05', title: 'ポーツマス条約' }],
		});
		const { user, onselectrelated, rerender } = setup(ev, {
			collections: [makeCollection({ slug: 'war-and-peace', title: '戦争と講和' })],
			books: [{ title: '関連本', store: 'amazon', url: 'https://example.com/book' }],
		});
		expect(screen.getByRole('link', { name: '戦争と講和' })).toHaveAttribute('href', '/c/war-and-peace');
		expect(screen.getByRole('heading', { level: 3, name: '関連書籍' })).toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: /ポーツマス条約/ }));
		expect(onselectrelated).toHaveBeenCalledWith('rel-1');
		expect(screen.getByText('1905.09')).toBeInTheDocument();

		// Switching to the related event swaps the body under the pressed link; focus moves to
		// the new title instead of falling out of the still-open modal (SHIG 60)
		await rerender({ ev: makeEvent({ id: 'rel-1', date: '1905-09-05', title: 'ポーツマス条約' }) });
		expect(screen.getByRole('heading', { level: 2, name: 'ポーツマス条約' })).toHaveFocus();
	});

	it('closes after the exit animation when the close button is pressed', async () => {
		const { dialog, user, onclose } = setup(makeEvent());
		await user.click(screen.getByRole('button', { name: '閉じる' }));
		expect(dialog).toHaveClass('closing');
		expect(onclose).not.toHaveBeenCalled();
		// A second press during the animation is ignored
		await user.click(screen.getByRole('button', { name: '閉じる' }));
		await waitFor(() => expect(onclose).toHaveBeenCalledTimes(1));
		expect(dialog.open).toBe(false);
	});

	it('closes immediately with reduced motion, on Escape (cancel) and on a backdrop click', async () => {
		media.reducedMotion = true;
		const { dialog, onclose, rerender } = setup(makeEvent());

		const cancel = new Event('cancel', { cancelable: true });
		dialog.dispatchEvent(cancel);
		// The browser's own close is replaced by the animated one
		expect(cancel.defaultPrevented).toBe(true);
		expect(onclose).toHaveBeenCalledTimes(1);

		// The parent reopens with another event
		await rerender({ ev: makeEvent({ id: 'other' }) });
		expect(dialog.open).toBe(true);
		// Clicks inside the content do not close it
		await fireEvent.click(screen.getByText('テスト用の要約です。'));
		expect(dialog.open).toBe(true);
		await fireEvent.click(dialog);
		expect(onclose).toHaveBeenCalledTimes(2);
	});

	it('closes when the parent clears the event and releases the scroll lock', async () => {
		const { dialog, rerender } = setup(makeEvent());
		await rerender({ ev: null });
		expect(dialog.open).toBe(false);
		expect(document.documentElement).not.toHaveClass('modal-open');
	});
});
