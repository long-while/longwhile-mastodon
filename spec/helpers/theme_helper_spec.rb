# frozen_string_literal: true

require 'rails_helper'

RSpec.describe ThemeHelper do
  describe 'theme_style_tags' do
    let(:result) { helper.theme_style_tags(theme) }

    # 헬퍼는 포크(=4.5) 것이라 "system" 테마를 여전히 받는다. 상류 4.6 은 이 예제를 지웠다(R3).
    context 'when using "system" theme' do
      let(:theme) { 'system' }

      it 'returns the mastodon-light and application stylesheets with correct color schemes' do
        expect(html_links.first.attributes.symbolize_keys)
          .to include(
            href: have_attributes(value: include('mastodon-light')),
            media: have_attributes(value: 'not all and (prefers-color-scheme: dark)')
          )
        expect(html_links.last.attributes.symbolize_keys)
          .to include(
            href: have_attributes(value: include('default')),
            media: have_attributes(value: '(prefers-color-scheme: dark)')
          )
      end
    end

    context 'when using "default" theme' do
      let(:theme) { 'default' }

      it 'returns the default stylesheet' do
        expect(html_links.last.attributes.symbolize_keys)
          .to include(
            href: have_attributes(value: include('default'))
          )
      end
    end

    context 'when using other theme' do
      # 이 포크의 config/themes.yml 에는 contrast 가 없다(첫 커밋부터). 포크의 테마로 본다.
      let(:theme) { 'mastodon-bird-ui-dark' }

      it 'returns the theme stylesheet without color scheme information' do
        expect(html_links.first.attributes.symbolize_keys)
          .to include(
            href: have_attributes(value: include('mastodon-bird-ui-dark')),
            media: have_attributes(value: 'all')
          )
      end
    end
  end

  # @_longwhile — 상류 4.7 의 Vite 연동은 `themes/<이름>` 같은 가상 이름을 manifest 의
  #   `name` 으로 푼다. 이 포크 빌드의 CSS 엔트리에는 `name` 이 없어서, 가상 이름으로
  #   부르면 4.7 에서 모든 화면이 MissingEntryError 가 된다. 실제 키로 부르는지 본다.
  describe 'theme_style_tags manifest lookup' do
    before { allow(helper).to receive(:vite_stylesheet_tag).and_call_original }

    it 'asks for the real manifest key of the chosen theme, not a virtual name' do
      helper.theme_style_tags('mastodon-bird-ui-dark')

      expect(helper).to have_received(:vite_stylesheet_tag)
        .with('styles/mastodon-bird-ui-dark.scss', media: 'all', crossorigin: 'anonymous')
    end

    it 'uses the real keys for both halves of the system theme' do
      helper.theme_style_tags('system')

      expect(helper).to have_received(:vite_stylesheet_tag).with('styles/mastodon-light.scss', hash_including(media: 'not all and (prefers-color-scheme: dark)'))
      expect(helper).to have_received(:vite_stylesheet_tag).with('styles/application.scss', hash_including(media: '(prefers-color-scheme: dark)'))
    end
  end

  # 테마 이름으로 색을 고르는 포크(=4.5) 형태다. 상류 4.6 은 color_scheme 을 받는다(R3).
  describe 'theme_color_tags' do
    let(:result) { helper.theme_color_tags(theme) }

    context 'when using system theme' do
      let(:theme) { 'system' }

      it 'returns the mastodon-light and default stylesheets with correct color schemes' do
        expect(html_theme_colors.first.attributes.symbolize_keys)
          .to include(
            content: have_attributes(value: Themes::THEME_COLORS[:dark]),
            media: have_attributes(value: '(prefers-color-scheme: dark)')
          )
        expect(html_theme_colors.last.attributes.symbolize_keys)
          .to include(
            content: have_attributes(value: Themes::THEME_COLORS[:light]),
            media: have_attributes(value: '(prefers-color-scheme: light)')
          )
      end
    end

    context 'when using mastodon-light theme' do
      let(:theme) { 'mastodon-light' }

      it 'returns the theme stylesheet without color scheme information' do
        expect(html_theme_colors.first.attributes.symbolize_keys)
          .to include(
            content: have_attributes(value: Themes::THEME_COLORS[:light])
          )
      end
    end

    context 'when using other theme' do
      let(:theme) { 'contrast' }

      it 'returns the theme stylesheet without color scheme information' do
        expect(html_theme_colors.first.attributes.symbolize_keys)
          .to include(
            content: have_attributes(value: Themes::THEME_COLORS[:dark])
          )
      end
    end
  end

  describe '#custom_stylesheet' do
    let(:custom_css) { 'body {}' }
    let(:custom_digest) { Digest::SHA256.hexdigest(custom_css) }

    before do
      Setting.custom_css = custom_css
    end

    context 'when custom css setting value digest is present' do
      before { Rails.cache.write(:setting_digest_custom_css, custom_digest) }

      it 'returns value from settings' do
        expect(custom_stylesheet)
          .to match("/css/custom-#{custom_digest[...8]}.css")
      end
    end

    context 'when custom css setting value digest is expired' do
      before { Rails.cache.delete(:setting_digest_custom_css) }

      it 'returns value from settings' do
        expect(custom_stylesheet)
          .to match("/css/custom-#{custom_digest[...8]}.css")
      end
    end

    context 'when custom css setting is not present' do
      before do
        Setting.custom_css = nil
        Rails.cache.delete(:setting_digest_custom_css)
      end

      it 'returns default value' do
        expect(custom_stylesheet)
          .to be_blank
      end
    end
  end

  describe '#custom_wordmark_tag' do
    let(:presenter) { instance_double(InstancePresenter, wordmark_dark: dark, wordmark_light: nil) }

    before { allow(InstancePresenter).to receive(:new).and_return(presenter) }

    context 'when no wordmark is uploaded' do
      let(:dark) { nil }

      it 'emits nothing, so the themes keep their bundled images' do
        expect(custom_wordmark_tag).to be_nil
      end
    end

    context 'when a wordmark is uploaded' do
      let(:dark) { instance_double(SiteUpload, file: instance_double(Paperclip::Attachment, url: url)) }
      let(:url) { '/system/site_uploads/files/000/000/001/original/wordmark.png?1700000000' }

      it 'exposes only the uploaded one as a CSS variable' do
        expect(custom_wordmark_tag)
          .to eq(%(<style>:root{--lw-wordmark-dark:url("#{url}");}</style>))
      end
    end

    context 'when the URL carries characters that could end the string or the tag' do
      let(:dark) { instance_double(SiteUpload, file: instance_double(Paperclip::Attachment, url: url)) }
      # %() 안의 `\c<` 는 제어 문자 하나가 되어 `\` 와 `<` 가 사라진다. 글자 그대로 넣는다.
      let(:url) { %q(/a"b\c</style><script>) }

      it 'escapes them' do
        expect(custom_wordmark_tag)
          .to include('/a\22 b\5c c\3c /style\3e \3c script\3e ')
          .and not_include('</style><')
      end
    end
  end

  describe '#current_theme' do
    subject { helper.current_theme }

    context 'when user is not signed in' do
      # 이 포크의 기본 테마는 config/settings.yml 의 mastodon-bird-ui-light 다(상류는 default).
      context 'when theme was not changed in settings' do
        it { is_expected.to eq('mastodon-bird-ui-light') }
      end

      context 'when theme is changed in settings' do
        before do
          allow(Themes.instance).to receive(:names).and_return(%w(default contrast))
          Setting.theme = 'contrast'
        end

        it { is_expected.to eq('contrast') }
      end

      context 'when theme is changed to invalid value' do
        before { Setting.theme = 'fakethemename' }

        it { is_expected.to eq('default') }
      end
    end

    context 'when user is signed in' do
      before { allow(helper).to receive(:current_user).and_return(current_user) }

      let(:current_user) { Fabricate :user }

      context 'when user did not set theme' do
        it { is_expected.to eq('mastodon-bird-ui-light') }
      end

      # 포크 테마는 config/themes.yml 에 실제로 있다. 상류 4.6 은 테마를 default 하나로 줄였지만
      # 이 포크는 테마 선택을 지킨다(R3).
      context 'when user picked one of the fork themes' do
        before { current_user.settings.update(theme: 'mastodon-bird-ui-dark', noindex: false) }

        it { is_expected.to eq('mastodon-bird-ui-dark') }
      end

      context 'when user set theme' do
        before { current_user.settings.update(theme: 'alternate', noindex: false) }

        context 'when theme is valid' do
          before { allow(Themes.instance).to receive(:names).and_return %w(default alternate good evil) }

          it { is_expected.to eq('alternate') }
        end

        context 'when theme is not valid' do
          it { is_expected.to eq('mastodon-bird-ui-light') }
        end
      end
    end
  end

  describe '#page_color_scheme' do
    subject { helper.page_color_scheme }

    context 'when force_color_scheme is present' do
      before { helper.content_for(:force_color_scheme) { 'value' } }

      it { is_expected.to eq('value') }
    end

    context 'when force_color_scheme is absent' do
      it { is_expected.to eq('auto') }
    end
  end

  private

  def html_links
    Nokogiri::HTML5.fragment(result).css('link')
  end

  def html_theme_colors
    Nokogiri::HTML5.fragment(result).css('meta[name=theme-color]')
  end
end
