'use client';

import Link from 'next/link';
import { ChevronDown, Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Brand } from './brand';
import { MobileNavigation } from './mobile-navigation';
import { NAVIGATION } from '@/lib/content/public-architecture';
import { SITE } from '@/lib/content/site';

type MarketingSurface = 'carbon' | 'white' | 'ivory' | 'cloud' | 'mineral' | 'mineral-light';

export function SiteHeader() {
  const path = usePathname();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [topSurface, setTopSurface] = useState<MarketingSurface>('carbon');
  const trigger = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const lastPointerType = useRef<string | null>(null);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const readTopSurface = () => {
      const firstSurface = document.querySelector<HTMLElement>('[data-npt-surface]');
      const surface = firstSurface?.dataset.nptSurface as MarketingSurface | undefined;
      setTopSurface(surface ?? 'carbon');
    };
    const frame = window.requestAnimationFrame(readTopSurface);
    return () => window.cancelAnimationFrame(frame);
  }, [path]);
  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 18;
      setScrolled((previous) => (previous === next ? previous : next));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    setMobileOpen(false);
    setOpenMenu(null);
  }, [path]);

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !navRef.current?.contains(event.target)) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpenMenu(null);
      navRef.current
        ?.querySelector<HTMLButtonElement>(`[data-menu-trigger="${openMenu}"]`)
        ?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  return (
    <>
      <header
        className="site-header capital-command-bar"
        data-home={path === '/' ? 'true' : 'false'}
        data-scrolled={scrolled ? 'true' : 'false'}
        data-surface={scrolled ? 'carbon' : topSurface}
      >
        <div className="nav-shell">
          <Brand tone="teal" />
          <nav
            ref={navRef}
            className="desktop-command-nav"
            aria-label="Primary navigation"
            onPointerDownCapture={(event) => { lastPointerType.current = event.pointerType; }}
            onKeyDownCapture={() => { lastPointerType.current = null; }}
          >
            {NAVIGATION.map((item) => {
              const hasMenu = item.links.length > 1;
              const menuId = `command-nav-menu-${item.label.toLowerCase()}`;
              return (
                <div
                  className="command-nav-group"
                  key={item.label}
                  onPointerEnter={(event) => {
                    if (hasMenu && event.pointerType === 'mouse') setOpenMenu(item.label);
                  }}
                  onPointerLeave={(event) => {
                    if (event.pointerType === 'mouse' && !event.currentTarget.contains(document.activeElement)) {
                      setOpenMenu(null);
                    }
                  }}
                  onFocusCapture={() => {
                    if (hasMenu && lastPointerType.current !== 'touch') setOpenMenu(item.label);
                  }}
                  onBlurCapture={(event) => {
                    const nextTarget = event.relatedTarget as Node | null;
                    if (!nextTarget || !event.currentTarget.contains(nextTarget)) setOpenMenu(null);
                  }}
                >
                  <Link
                    href={item.href}
                    aria-current={
                      path === item.href || path.startsWith(`${item.href}/`) ? 'page' : undefined
                    }
                  >
                    {item.label}
                  </Link>
                  {hasMenu ? (
                    <button
                      className="command-nav-trigger"
                      type="button"
                      aria-label={`Open ${item.label} menu`}
                      aria-expanded={openMenu === item.label}
                      aria-controls={menuId}
                      data-menu-trigger={item.label}
                      onClick={() => {
                        lastPointerType.current = null;
                        setOpenMenu((current) => current === item.label ? null : item.label);
                      }}
                    >
                      <ChevronDown aria-hidden="true" />
                    </button>
                  ) : null}
                  {hasMenu ? (
                    <div id={menuId} className="command-nav-menu" data-open={openMenu === item.label ? 'true' : 'false'}>
                      <div>
                        <Link href={item.href}>
                          <span>Overview</span>
                          <small>{item.description}</small>
                        </Link>
                        {item.links.map((link) => (
                          <Link href={link.href} key={link.href}>
                            <span>{link.label}</span>
                            <small>{link.description}</small>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
          <div className="command-actions">
            <Link className="command-contact-action" href="/contact">Talk to Neptlium</Link>
            <a href={SITE.personalSignInUrl}>Sign in</a>
            <a className="command-primary-action" href={SITE.personalSignUpUrl}>
              Get started
            </a>
          </div>
          <div className="elite-header-actions">
            <a className="elite-header-entry" href={SITE.personalSignUpUrl}>
              Get started
            </a>
            <button
              ref={trigger}
              className="elite-menu-trigger"
              type="button"
              aria-expanded={mobileOpen}
              aria-controls="mobile-command-sheet"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      {mounted && mobileOpen
        ? createPortal(
            <MobileNavigation
              path={path}
              onClose={closeMobile}
              triggerRef={trigger}
            />,
            document.body,
          )
        : null}
    </>
  );
}
