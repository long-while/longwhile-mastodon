# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Admin::StatusPolicy do
  let(:policy) { described_class }
  let(:admin)   { Fabricate(:admin_user).account }
  let(:john)    { Fabricate(:account) }
  let(:status) { Fabricate(:status, visibility: status_visibility) }
  let(:status_visibility) { :public }

  permissions :index?, :update?, :review?, :destroy? do
    context 'with an admin' do
      it 'permits' do
        expect(policy).to permit(admin, Status)
      end
    end

    context 'with a non-admin' do
      it 'denies' do
        expect(policy).to_not permit(john, Status)
      end
    end
  end

  permissions :show? do
    context 'with an admin' do
      context 'with a public visible status' do
        let(:status_visibility) { :public }

        it 'permits' do
          expect(policy).to permit(admin, status)
        end
      end

      context 'with a not public visible status' do
        let(:status_visibility) { :direct }

        # 이 포크는 admin/owner 에게 DM 운영진 열람을 허용한다(StatusPolicy#administrator?, 3b11809336).
        # 막는 쪽은 아래 모더레이터 예제가 같은 강도로 검사한다.
        it 'permits' do
          expect(policy).to permit(admin, status)
        end
      end
    end

    context 'with a moderator' do
      let(:moderator) { Fabricate(:moderator_user).account }

      context 'with a not public visible status' do
        let(:status_visibility) { :direct }

        it 'denies' do
          expect(policy).to_not permit(moderator, status)
        end

        context 'when the status mentions the moderator' do
          before do
            status.mentions.create!(account: moderator)
          end

          it 'permits' do
            expect(policy).to permit(moderator, status)
          end
        end
      end
    end

    context 'with a non admin' do
      it 'denies' do
        expect(policy).to_not permit(john, status)
      end
    end
  end
end
