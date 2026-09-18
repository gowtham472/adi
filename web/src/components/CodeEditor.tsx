import { FolderOpenIcon, type Icon } from '@phosphor-icons/react';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';

/** Templates above this size are almost certainly the wrong file. */
const MAX_FILE_BYTES = 1024 * 1024;
const ACCEPTED = '.yaml,.yml,.json,.template,.txt';

interface CodeEditorProps {
  readonly label: string;
  readonly fileName: string;
  readonly icon: Icon;
  readonly value: string;
  readonly placeholder: string;
  readonly onChange: (value: string) => void;
  readonly headerExtra?: ReactNode;
}

/**
 * A plain textarea with a line number gutter that scrolls with it, plus loading from a
 * file by picker or by dropping it on the editor.
 */
export function CodeEditor({ label, fileName, icon: HeaderIcon, value, placeholder, onChange, headerExtra }: CodeEditorProps) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loadedName, setLoadedName] = useState<string | undefined>();
  const [fileError, setFileError] = useState<string | undefined>();

  const lines = value === '' ? 1 : value.split('\n').length;

  const load = (file: File | undefined) => {
    if (file === undefined) {
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`${file.name} is larger than 1 MB`);
      return;
    }
    file.text().then(
      (text) => {
        onChange(text);
        setLoadedName(file.name);
        setFileError(undefined);
      },
      () => {
        setFileError(`${file.name} could not be read`);
      },
    );
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    load(event.dataTransfer.files[0]);
  };

  return (
    <div
      className={`editor ${dragging ? 'dragging' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => { setDragging(false); }}
      onDrop={onDrop}
    >
      <div className="editor-header">
        <HeaderIcon weight="bold" aria-hidden="true" />
        <span className="editor-file">{loadedName ?? fileName}</span>
        {headerExtra}
        <button type="button" className="text-button" onClick={() => inputRef.current?.click()}>
          <FolderOpenIcon weight="bold" aria-hidden="true" />
          Open file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          hidden
          onChange={(event) => {
            load(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
      <div className="editor-body">
        <div className="gutter" ref={gutterRef} aria-hidden="true">
          {Array.from({ length: lines }, (_, index) => (
            <span key={index}>{index + 1}</span>
          ))}
        </div>
        <textarea
          aria-label={label}
          value={value}
          onChange={(event) => { onChange(event.target.value); setLoadedName(undefined); }}
          onScroll={(event) => {
            if (gutterRef.current !== null) {
              gutterRef.current.scrollTop = event.currentTarget.scrollTop;
            }
          }}
          placeholder={placeholder}
          spellCheck={false}
          wrap="off"
        />
        {dragging && <div className="drop-overlay">Drop a template to load it</div>}
      </div>
      <div className="editor-footer">
        <span>{value === '' ? 0 : lines} lines</span>
        {fileError === undefined ? <span>YAML or JSON, or drop a file</span> : <span className="file-error">{fileError}</span>}
      </div>
    </div>
  );
}
