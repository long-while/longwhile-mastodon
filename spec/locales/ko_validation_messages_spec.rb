# frozen_string_literal: true

require 'rails_helper'

# rails-i18n 8.1 이 ko 오류 문구에서 %{attribute} 를 뺐다("내용을 입력해 주세요").
# 화면은 errors.format 이 "%{message}" 라 칸 이름이 아예 사라지고, API 오류
# 문자열도 어느 칸인지 알려 주지 않는다. config/locales/rails.ko.yml 이 옛 문구를
# 되살린다. 문구를 글자로 박아 두어 젬이 바뀌어도 조용히 달라지지 않게 한다.
RSpec.describe 'I18n' do
  describe 'Korean validation messages' do
    around { |example| I18n.with_locale(:ko) { example.run } }

    def full_messages_for(record)
      record.valid?
      record.errors.full_messages
    end

    it 'keeps the attribute in every rails-i18n message that can take one' do
      keys = %i(accepted blank confirmation empty equal_to even exclusion greater_than greater_than_or_equal_to in inclusion invalid
                less_than less_than_or_equal_to not_a_number not_an_integer odd other_than present required taken too_long too_short wrong_length)

      expect(keys.reject { |key| I18n.t(key, scope: 'errors.messages').match?(/%{attribute}/) }).to be_empty
    end

    # ActiveModel::ValidationError 는 errors 만 넘긴다. rails-i18n 8.0 의 문구는
    # %{attribute} 를 요구해서 MissingInterpolationArgument 로 터졌다.
    it 'builds a model_invalid message without an attribute' do
      expect(I18n.t('errors.messages.model_invalid', errors: 'X')).to eq '데이터 검증에 실패하였습니다: X'
    end

    it 'names the field of an empty status' do
      expect(full_messages_for(Status.new(account: Fabricate(:account), text: '')))
        .to include('Text에 내용을 입력해 주세요')
    end

    it 'keeps the custom message of a status that is too long' do
      expect(full_messages_for(Status.new(account: Fabricate(:account), text: 'a' * 5001)))
        .to include('최대 1000자까지 입력할 수 있습니다')
    end

    it 'names the field of a display name that is too long' do
      limit = Account::DISPLAY_NAME_LENGTH_LIMIT

      expect(full_messages_for(Account.new(username: 'kmsg', display_name: 'a' * (limit + 1))))
        .to include("Display name은(는) #{limit}자를 넘을 수 없습니다")
    end

    it 'names the fields on sign-up' do
      user = User.new(email: 'bad', password: 'short', password_confirmation: 'x', agreement: false, account: Account.new(username: 'kmsg'))

      expect(full_messages_for(user)).to include(
        '이메일 주소은(는) 올바르지 않은 값입니다',
        '암호은(는) 서로 일치해야 합니다',
        '암호은(는) 적어도 8자를 넘어야 합니다',
        '이용약관을(를) 반드시 확인해야 합니다'
      )
    end

    it 'names the field of a blank email' do
      expect(full_messages_for(User.new(email: '', account: Account.new(username: 'kmsg'))))
        .to include('이메일 주소에 내용을 입력해 주세요')
    end

    it 'names the field of a report comment that is too long' do
      account = Fabricate(:account)

      expect(full_messages_for(Report.new(account: account, target_account: Fabricate(:account), comment: 'c' * 1001)))
        .to include('Comment은(는) 1000자를 넘을 수 없습니다')
    end

    it 'names the field of a DM room without participants' do
      expect(full_messages_for(DmRoom.new)).to include('Participant key에 내용을 입력해 주세요')
    end

    it 'keeps the custom message of a scheduled status that is too soon' do
      expect(full_messages_for(ScheduledStatus.new(account: Fabricate(:account), scheduled_at: Time.now.utc, params: {})))
        .to include('미래의 날짜여야 합니다')
    end

    describe 'API error responses', type: :request do
      let(:user) { Fabricate(:user) }
      let(:token) { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: 'write:lists') }

      it 'names the field in the 422 error string' do
        post '/api/v1/lists', headers: { 'Authorization' => "Bearer #{token.token}" }, params: { title: '' }

        expect(response).to have_http_status(422)
        expect(response.parsed_body[:error]).to eq '데이터 검증에 실패하였습니다. Title에 내용을 입력해 주세요'
      end
    end
  end
end
