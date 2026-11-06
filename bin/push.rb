# push notes: commits each repo's changes with its note and pushes, driven by push-notes.yaml.
#
#   ruby push.rb                       commit and push every repo with a note
#   ruby push.rb --dry                 say what it would do, change nothing
#   ruby push.rb --only NAME           just that repo (folder name)
#   ruby push.rb --init                create push-notes.yaml here, listing the git repos in this folder
#   ruby push.rb --plan-json           the state of every repo as json (read only)
#   ruby push.rb --set-note NAME TEXT
#   ruby push.rb --clear-notes
#
# any of them takes a config path as the last argument. without one, the config is
#   1. $PUSH_NOTES_CONFIG, if set
#   2. push-notes.yaml in this folder or the nearest parent folder that has one
# repo paths in the config are relative to the config file.

require 'yaml'
require 'json'
require 'open3'

CONFIG_NAME = 'push-notes.yaml'

HEADER = <<~TXT
  # push notes
  #
  # fill in a note for each repo you want to push, then run /push-notes in claude code
  # to check it and push, or `ruby push.rb --dry` then `ruby push.rb`.
  #
  # a repo with an empty note is skipped.
  # notes are lowercase and simple, a sentence or two.
  # the note is the whole commit message, nothing else gets added.
  # repo paths are relative to this file.

  # the github account that pushes. the script stops if gh is signed in as anyone else
TXT

args = ARGV.dup
mode = :push
mode = :dry if args.delete('--dry')
mode = :plan if args.delete('--plan-json')
mode = :clear if args.delete('--clear-notes')
mode = :init if args.delete('--init')
only = nil
if (i = args.index('--only'))
  only = args[i + 1]
  args.slice!(i, 2)
end
set_note = nil
if (i = args.index('--set-note'))
  mode = :set
  set_note = [args[i + 1], args[i + 2].to_s]
  args.slice!(i, 3)
end
def find_config
  return File.expand_path(ENV['PUSH_NOTES_CONFIG']) if ENV['PUSH_NOTES_CONFIG'].to_s != ''
  dir = Dir.pwd
  loop do
    candidate = File.join(dir, CONFIG_NAME)
    return candidate if File.file?(candidate)
    parent = File.dirname(dir)
    return nil if parent == dir
    dir = parent
  end
end

CONFIG_PATH = args[0] ? File.expand_path(args[0]) : (mode == :init ? File.join(Dir.pwd, CONFIG_NAME) : find_config)

if mode == :plan && (CONFIG_PATH.nil? || !File.file?(CONFIG_PATH))
  puts JSON.generate(config: nil, cwd: Dir.pwd, account: '', signedInAs: nil, repos: [])
  exit
end
if mode != :init && (CONFIG_PATH.nil? || !File.file?(CONFIG_PATH))
  abort "no #{CONFIG_NAME} here or in a parent folder. run `ruby push.rb --init` in the folder that holds your repos"
end

def load_config
  YAML.safe_load(File.read(CONFIG_PATH)) || {}
end

# a repo's path in the config, made absolute against the config file's folder
def repo_dir(r)
  File.expand_path(r['path'].to_s, File.dirname(CONFIG_PATH))
end

def write_config(config)
  out = HEADER.dup
  out << "account: #{config['account']}\n\nrepos:\n"
  (config['repos'] || []).each do |r|
    out << "  - path: #{r['path']}\n"
    out << "    branch: #{r['branch'] || 'main'}\n"
    out << "    note: #{r['note'].to_s.to_json}\n\n"
  end
  File.write(CONFIG_PATH, out.rstrip + "\n")
end

def run(cmd, dir: nil)
  out, status = Open3.capture2e(*cmd, chdir: dir || Dir.pwd)
  [out.strip, status.success?]
end

def must(cmd, dir:)
  out, ok = run(cmd, dir: dir)
  abort "  failed: #{cmd.join(' ')}\n  #{out}" unless ok
  out
end

# the note is the whole commit message: one line, lowercase, no trailers or tool credits
def clean_note(note)
  lines = note.to_s.lines.map(&:strip).reject(&:empty?)
  lines.reject! { |l| l =~ /\A(co-authored-by|signed-off-by|generated with|🤖)/i }
  lines.join(' ').downcase.squeeze(' ')
end

def env_file?(path)
  File.basename(path.to_s) =~ /\A\.env(\..*)?\z/ && path.to_s !~ /\.example\z/
end

if mode == :init
  abort "#{CONFIG_PATH} already exists" if File.exist?(CONFIG_PATH)
  here = Dir.pwd
  found = []
  found << '.' if File.directory?(File.join(here, '.git'))
  Dir.children(here).sort.each do |c|
    found << "./#{c}" if File.directory?(File.join(here, c, '.git'))
  end
  abort 'no git repos in this folder or directly under it' if found.empty?
  who, ok = run(%w[gh api user --jq .login])
  repos = found.map do |path|
    branch, = run(%w[git branch --show-current], dir: File.join(here, path))
    { 'path' => path, 'branch' => branch.empty? ? 'main' : branch, 'note' => '' }
  end
  write_config('account' => ok ? who : '', 'repos' => repos)
  puts "created #{CONFIG_PATH} with #{repos.size} repo#{repos.size == 1 ? '' : 's'}"
  exit
end

config = load_config
repos = config['repos'] || []

case mode
when :set
  name, text = set_note
  repo = repos.find { |r| File.basename(repo_dir(r)) == name }
  abort "no repo named #{name} in #{CONFIG_PATH}" unless repo
  repo['note'] = clean_note(text)
  write_config(config)
  puts "note set for #{name}"
  exit
when :clear
  repos.each { |r| r['note'] = '' }
  write_config(config)
  puts 'notes cleared'
  exit
when :plan
  who, ok = run(%w[gh api user --jq .login])
  plan = repos.map do |r|
    dir = repo_dir(r)
    item = { name: File.basename(dir), path: dir, branch: (r['branch'] || 'main').to_s,
             note: clean_note(r['note']) }
    unless File.directory?(File.join(dir, '.git'))
      item[:error] = 'not a git repo'
      next item
    end
    status = run(%w[git status --porcelain], dir: dir)[0]
    files = status.lines.map { |l| l[3..-1].to_s.strip.split(' -> ').last }
    files.reject! { |f| File.join(dir, f) == CONFIG_PATH }
    item[:current] = run(%w[git branch --show-current], dir: dir)[0]
    item[:changed] = files.size
    item[:files] = files.first(8)
    item[:envFile] = files.any? { |f| env_file?(f) }
    ahead, ok_ahead = run(['git', 'rev-list', '--count', "origin/#{item[:branch]}..HEAD"], dir: dir)
    item[:ahead] = ok_ahead ? ahead.to_i : 0
    item
  end
  puts JSON.generate(config: CONFIG_PATH, cwd: Dir.pwd, account: config['account'].to_s,
                     signedInAs: ok ? who : nil, repos: plan)
  exit
end

dry = mode == :dry
account = config['account'].to_s
who, ok = run(%w[gh api user --jq .login])
abort "could not reach github with gh: #{who}" unless ok
abort "gh is signed in as #{who}, not #{account}. run: gh auth switch -u #{account} && gh auth setup-git" if who != account

todo = repos.reject { |r| clean_note(r['note']).empty? }
todo.select! { |r| File.basename(repo_dir(r)) == only } if only
abort(only ? "#{only} has no note, nothing to push" : 'no repo has a note, nothing to push') if todo.empty?

todo.each do |r|
  dir = repo_dir(r)
  branch = (r['branch'] || 'main').to_s
  note = clean_note(r['note'])
  name = File.basename(dir)
  puts "== #{name} -> #{branch}"
  puts "   note: #{note}"

  abort "  #{dir} is not a git repo" unless File.directory?(File.join(dir, '.git'))

  must(%w[git fetch -q origin], dir: dir)
  current = must(%w[git branch --show-current], dir: dir)
  status = run(%w[git status --porcelain], dir: dir)[0]
  files = status.lines.map { |l| l[3..-1].to_s.strip.split(' -> ').last }
  files.reject! { |f| File.join(dir, f) == CONFIG_PATH }

  # never push env files, even if a .gitignore is missing
  abort "  an .env file is about to be committed in #{name}, stopping" if files.any? { |f| env_file?(f) }

  if dry
    puts "   would #{current == branch ? 'stay on' : 'switch to'} #{branch}, commit #{files.size} changed files, push to origin/#{branch}"
    next
  end

  if current != branch
    _, exists = run(['git', 'rev-parse', '--verify', '--quiet', branch], dir: dir)
    must(exists ? ['git', 'checkout', '-q', branch] : ['git', 'checkout', '-q', '-b', branch], dir: dir)
  end

  must(%w[git add -A], dir: dir)
  # the config holds draft notes, it never goes into a commit
  if CONFIG_PATH.start_with?(dir + '/')
    run(['git', 'reset', '-q', '--', CONFIG_PATH.sub(dir + '/', '')], dir: dir)
  end
  staged = must(%w[git diff --cached --name-only], dir: dir).lines.size
  if staged.zero?
    puts '   nothing to commit'
  else
    must(['git', 'commit', '-q', '-m', note], dir: dir)
    puts "   committed #{staged} files"
  end

  out, has_remote = run(['git', 'rev-list', '--count', "HEAD..origin/#{branch}"], dir: dir)
  behind = has_remote ? out.to_i : 0
  abort "  origin/#{branch} has #{behind} commits you do not have. pull first, then run again" if behind.positive?

  must(['git', 'push', '-q', '-u', 'origin', branch], dir: dir)
  puts "   pushed #{must(%w[git rev-parse --short HEAD], dir: dir)}"
end

puts dry ? "\ndry run, nothing changed" : "\ndone"
