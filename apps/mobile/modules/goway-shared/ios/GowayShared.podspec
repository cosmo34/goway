Pod::Spec.new do |s|
  s.name           = 'GowayShared'
  s.version        = '1.0.0'
  s.summary        = 'Types partagés Live Activity GOWAY'
  s.homepage       = 'https://goway.app'
  s.license        = 'MIT'
  s.author         = 'GOWAY'
  s.platform       = :ios, '16.2'
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.source_files   = '**/*.swift'
  s.frameworks     = 'ActivityKit'
end
