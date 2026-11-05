# frozen_string_literal: true

require 'singleton'
require 'yaml'

class Themes
  include Singleton

  THEME_COLORS = {
    dark: '#181820',
    light: '#ffffff',
  }.freeze

  def initialize
    @conf = YAML.load_file(Rails.root.join('config', 'themes.yml'))
  end

  def names
    @conf.keys
  end

  # The stylesheet source of a theme, e.g. `styles/application.scss`. It is the
  # theme's key in the Vite manifest, so it can be looked up without the
  # name-lookup file that only `vite_ruby` reads.
  def path_for(name)
    @conf.fetch(name)
  end
end
