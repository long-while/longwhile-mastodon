# frozen_string_literal: true

Fabricator(:bookmark_folder_item) do
  bookmark_folder { Fabricate.build(:bookmark_folder) }
  bookmark { |attrs| Fabricate.build(:bookmark, account: attrs[:bookmark_folder].account) }
end
