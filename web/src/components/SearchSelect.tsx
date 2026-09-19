import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon, type Icon } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface SearchSelectOption {
  readonly value: string;
  readonly label: string;
  /** Shown before the label in monospace, such as a rule ID. */
  readonly code?: string;
  /** Extra text matched by the search but not shown, such as a description. */
  readonly keywords?: string;
  readonly adornment?: ReactNode;
}

interface SearchSelectProps {
  readonly label: string;
  readonly icon: Icon;
  readonly options: readonly SearchSelectOption[];
  readonly value: string | undefined;
  readonly placeholder: string;
  readonly searchPlaceholder: string;
  readonly onChange: (value: string) => void;
}

function matches(option: SearchSelectOption, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === '' || [option.label, option.code ?? '', option.keywords ?? ''].join(' ').toLowerCase().includes(needle);
}

/**
 * A themed dropdown with a search box, in place of the native select. It follows the
 * listbox pattern: arrow keys move through the filtered options, Enter picks one, Escape
 * closes and returns focus to the button, and a click outside closes it.
 */
export function SearchSelect({ label, icon: LeadIcon, options, value, placeholder, searchPlaceholder, onChange }: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const visible = options.filter((option) => matches(option, query));
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  const openList = () => {
    setQuery('');
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  };

  const choose = (option: SearchSelectOption) => {
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(visible.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = visible[active];
      if (option !== undefined) {
        choose(option);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  };

  return (
    <div className={`search-select ${open ? 'open' : ''}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="search-select-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={selected === undefined ? label : `${label}: ${selected.label}`}
        onClick={() => { if (open) { setOpen(false); } else { openList(); } }}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            openList();
          }
        }}
      >
        <LeadIcon weight="bold" aria-hidden="true" />
        <span className={selected === undefined ? 'search-select-placeholder' : ''}>
          {selected === undefined ? placeholder : selected.label}
        </span>
        <CaretDownIcon weight="bold" className="search-select-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="search-select-panel" onKeyDown={onKeyDown}>
          <label className="search-select-search">
            <MagnifyingGlassIcon weight="bold" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => { setQuery(event.target.value); setActive(0); }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-controls={listId}
              aria-activedescendant={visible[active] === undefined ? undefined : `${listId}-${visible[active].value}`}
            />
          </label>
          <ul id={listId} role="listbox" aria-label={label} className="search-select-list">
            {visible.length === 0 && <li className="search-select-empty">Nothing matches "{query}"</li>}
            {visible.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${option.value}`}
                role="option"
                aria-selected={option.value === value}
                className={`search-select-option ${index === active ? 'active' : ''}`}
                onMouseEnter={() => { setActive(index); }}
                onMouseDown={(event) => { event.preventDefault(); choose(option); }}
              >
                {option.code !== undefined && <code>{option.code}</code>}
                <span className="search-select-label">{option.label}</span>
                {option.adornment}
                {option.value === value && <CheckIcon weight="bold" className="search-select-check" aria-hidden="true" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
