# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'UnloggedBrowsing', :js, :streaming do
  subject { page }

  before do
    visit root_path
  end

  it 'loads the home page' do
    expect(subject).to have_css('div.app-holder')

    # 상류 4.6 프런트는 <main> 으로 바꿨다. 이 포크의 프런트는 고정이라 <div> 다.
    expect(subject).to have_css('div.columns-area__panels__main')
  end
end
