# frozen_string_literal: true

Fabricator(:bookmark_folder) do
  account { Fabricate.build(:account) }
  name { sequence(:bookmark_folder_name) { |i| "Folder #{i}" } }
end
