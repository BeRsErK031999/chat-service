import type { FormEvent, ReactElement } from 'react';
import type { Ref } from 'react';

type MessageComposerProps = {
  draft: string;
  disabled: boolean;
  isSending: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onDraftChange: (draft: string) => void;
  onSend: (event: FormEvent<HTMLFormElement>) => void;
};

export const MessageComposer = ({
  draft,
  disabled,
  isSending,
  inputRef,
  onDraftChange,
  onSend,
}: MessageComposerProps): ReactElement => (
  <form className="chat-ui-composer" onSubmit={onSend}>
    <input
      ref={inputRef}
      value={draft}
      onChange={(event) => onDraftChange(event.target.value)}
      placeholder="Write a test message"
      disabled={disabled || isSending}
    />
    <button type="submit" disabled={disabled || isSending || draft.trim().length === 0}>
      Send
    </button>
  </form>
);
