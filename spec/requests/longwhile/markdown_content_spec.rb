# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — 본문 서식. TextFormatter#apply_simple_markdown 이 로컬 글의 HTML 을
#   만들고, 그 HTML 이 그대로 API 의 content 로 나간다. 세부 규칙은
#   spec/lib/text_formatter_spec.rb 가 본다. 여기서는 **API 응답에 서식이 살아서
#   나오는지**와, 서식 문법이 마크업 주입 통로가 되지 않는지를 본다.
RSpec.describe 'Markdown in status content' do
  let(:user)    { Fabricate(:user) }
  let(:token)   { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: 'write:statuses read:statuses') }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  def posted_content(text)
    post '/api/v1/statuses', headers: headers, params: { status: text }
    expect(response).to have_http_status(200)
    response.parsed_body[:content]
  end

  it 'renders bold, italic, strike-through and colour' do
    content = posted_content('**굵게** *기울임* ~~~취소~~~ [color:ff0000]빨강[/color] [bg:00ff00]배경[/bg]')

    expect(content).to include('<strong>굵게</strong>', '<em>기울임</em>', '<del>취소</del>')
    expect(content).to include('<span style="color: #ff0000;">빨강</span>')
    expect(content).to include('<span style="background-color: #00ff00;">배경</span>')
  end

  it 'renders alignment blocks' do
    content = posted_content('[center]가운데[/center]')

    expect(content).to include('<span style="display: block; text-align: center;">가운데</span>')
  end

  it 'serves the same HTML when the status is fetched again' do
    content = posted_content('**굵게**')
    id      = response.parsed_body[:id]

    get "/api/v1/statuses/#{id}", headers: headers

    expect(response.parsed_body[:content]).to eq content
  end

  it 'keeps raw HTML escaped inside formatting' do
    content = posted_content('**<script>alert(1)</script>** [color:ff0000]<img src=x onerror=alert(1)>[/color]')

    expect(content).to_not include('<script', '<img')
    expect(content).to include('&lt;script&gt;')
  end

  it 'refuses a colour value that is not hex' do
    content = posted_content('[color:red;background:url(x)]text[/color]')

    expect(content).to_not include('style=')
  end
end
