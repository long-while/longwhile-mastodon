# frozen_string_literal: true

module Settings
  module Exports
    class BookmarkFoldersController < BaseController
      include Settings::ExportControllerConcern

      def index
        send_export_file
      end

      private

      def export_data
        @export.to_bookmark_folders_csv
      end
    end
  end
end
