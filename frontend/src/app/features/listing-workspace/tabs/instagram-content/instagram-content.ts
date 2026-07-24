import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { WorkspaceStateService } from '../../state/workspace-state.service';
import { AIListingService } from '../../services/ai-listing.service';
import { AttributeCard } from '../../components/attribute-card/attribute-card';
import { EditableTextArea } from '../../components/editable-textarea/editable-textarea';
import { KeywordChips } from '../../components/keyword-chips/keyword-chips';
import { Attribute } from '../../models/category.model';
import { getPath, setPath } from '../../utils/field-path.util';

interface FieldConfig {
  path: string;
  label: string;
  kind: 'text' | 'longtext' | 'array';
}

const FIELDS: FieldConfig[] = [
  { path: 'socialContent.shortCaption', label: 'Short Caption', kind: 'text' },
  { path: 'socialContent.longCaption', label: 'Long Caption', kind: 'longtext' },
  { path: 'socialContent.storyCaption', label: 'Story Caption', kind: 'text' },
  { path: 'socialContent.reelCaption', label: 'Reel Caption', kind: 'text' },
  { path: 'socialContent.cta', label: 'Call To Action', kind: 'text' },
  { path: 'socialContent.emojiVersion', label: 'Emoji Version', kind: 'text' },
  { path: 'socialContent.seoCaption', label: 'SEO Caption', kind: 'longtext' },
  { path: 'socialContent.hashtags', label: 'Hashtags', kind: 'array' },
  { path: 'socialContent.trendingHashtags', label: 'Trending Hashtags', kind: 'array' },
  { path: 'socialContent.suggestedPostingTime', label: 'Suggested Posting Time', kind: 'text' },
  { path: 'socialContent.suggestedMusic', label: 'Suggested Music', kind: 'text' },
  { path: 'socialContent.imagePrompt', label: 'Image Prompt', kind: 'longtext' },
  { path: 'socialContent.videoPrompt', label: 'Video Prompt', kind: 'longtext' },
];

@Component({
  selector: 'app-instagram-content',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AttributeCard, EditableTextArea, KeywordChips],
  templateUrl: './instagram-content.html',
})
export class InstagramContentTab {
  workspaceState = inject(WorkspaceStateService);
  private aiListingService = inject(AIListingService);

  fields = FIELDS;
  regeneratingPath = signal<string | null>(null);

  asAttribute(field: FieldConfig): Attribute {
    return { id: field.path, label: field.label, type: 'string', required: false, marketplaces: ['instagram'] };
  }

  getText(field: FieldConfig): string {
    const product = this.workspaceState.product();
    const raw = product ? getPath(product, field.path) : '';
    return raw == null ? '' : String(raw);
  }

  getArray(field: FieldConfig): string[] {
    const product = this.workspaceState.product();
    return (product ? (getPath(product, field.path) as string[]) : []) ?? [];
  }

  setValue(field: FieldConfig, value: string | string[]) {
    this.workspaceState.update(p => setPath(p, field.path, value));
  }

  async regenerate(field: FieldConfig) {
    const current = field.kind === 'array' ? this.getArray(field) : this.getText(field);
    this.regeneratingPath.set(field.path);
    try {
      const result = await this.aiListingService.regenerateMock(current);
      this.workspaceState.update(p => setPath(p, field.path, result));
    } finally {
      this.regeneratingPath.set(null);
    }
  }
}
