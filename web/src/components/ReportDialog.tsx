import { DownloadSimpleIcon, XIcon } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';

interface ReportDialogProps {
  readonly report: string;
  readonly onDownload: () => void;
  readonly onClose: () => void;
}

/**
 * Shown when the browser refuses clipboard access. The report is selected on open so a
 * keyboard copy works immediately.
 */
export function ReportDialog({ report, onDownload, onClose }: ReportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    textRef.current?.select();
  }, []);

  return (
    <dialog ref={dialogRef} className="report-dialog" onClose={onClose} aria-labelledby="report-title">
      <header>
        <h2 id="report-title">Analysis report</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <XIcon weight="bold" />
        </button>
      </header>
      <p className="muted">The browser blocked clipboard access. The report is selected below; copy it with your keyboard.</p>
      <textarea ref={textRef} readOnly value={report} aria-label="Analysis report in Markdown" wrap="off" />
      <footer>
        <button type="button" className="button button-outline button-small" onClick={onDownload}>
          <DownloadSimpleIcon weight="bold" aria-hidden="true" />
          Download Markdown
        </button>
        <button type="button" className="button button-solid button-small" onClick={onClose}>
          Done
        </button>
      </footer>
    </dialog>
  );
}
