import { systemNoticeText } from '../util/system_notice_text';

interface Props {
  contentHtml?: string;
}

export const SystemNotice: React.FC<Props> = ({ contentHtml }) => {
  const text = systemNoticeText(contentHtml);

  if (!text) return null;

  return (
    <div className='dm-system-notice' role='status'>
      {text}
    </div>
  );
};
